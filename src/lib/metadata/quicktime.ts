import { interpretCaptureTime, type CaptureTime } from "./capture-time";

// Minimal QuickTime/MP4 reader for the two things an iPhone video carries:
// when (com.apple.quicktime.creationdate, which includes the time zone,
// falling back to mvhd's UTC creation time) and where (ISO 6709 location).
// It reads by byte range, so a large video never has to be downloaded:
// the moov atom is a few hundred KB even when the file is gigabytes.

export type ByteReader = {
  size: number;
  read(offset: number, length: number): Promise<Buffer>;
};

export type VideoMetadata = {
  time: CaptureTime | null;
  lat: number | null;
  lng: number | null;
};

const MAX_MOOV_BYTES = 64 * 1024 * 1024;
const MAC_EPOCH_OFFSET = 2082844800; // seconds from 1904-01-01 to 1970-01-01

export function bufferReader(buf: Buffer): ByteReader {
  return { size: buf.length, read: async (o, l) => buf.subarray(o, o + l) };
}

type Atom = { type: string; start: number; headerSize: number; size: number };

function* atoms(buf: Buffer, start = 0, end = buf.length): Generator<Atom> {
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    let headerSize = 8;
    if (size === 1) {
      if (pos + 16 > end) return;
      size = Number(buf.readBigUInt64BE(pos + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize || pos + size > end) return;
    yield { type, start: pos, headerSize, size };
    pos += size;
  }
}

function child(buf: Buffer, parent: Atom, type: string, skip = 0): Atom | undefined {
  for (const a of atoms(buf, parent.start + parent.headerSize + skip, parent.start + parent.size)) {
    if (a.type === type) return a;
  }
  return undefined;
}

async function findMoov(reader: ByteReader): Promise<Buffer | null> {
  let pos = 0;
  while (pos + 8 <= reader.size) {
    const header = await reader.read(pos, 16);
    let size = header.readUInt32BE(0);
    const type = header.toString("latin1", 4, 8);
    if (size === 1) size = Number(header.readBigUInt64BE(8));
    else if (size === 0) size = reader.size - pos;
    if (size < 8) return null;
    if (type === "moov") {
      if (size > MAX_MOOV_BYTES) return null;
      return reader.read(pos, size);
    }
    pos += size;
  }
  return null;
}

// "+37.9715+023.7257+070.000/" -> [37.9715, 23.7257]
export function parseIso6709(value: string): { lat: number; lng: number } | null {
  const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(value.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// Apple's mdta metadata: a keys list plus an ilst whose children are
// numbered by key index, each holding a data atom with the value.
function readMdta(moov: Buffer, meta: Atom): Map<string, string> {
  const out = new Map<string, string>();
  // QuickTime meta has no version/flags; ISO MP4 meta does. Try both.
  const skip = child(moov, meta, "hdlr") ? 0 : 4;
  const keysAtom = child(moov, meta, "keys", skip);
  const ilst = child(moov, meta, "ilst", skip);
  if (!keysAtom || !ilst) return out;

  const keys: string[] = [];
  let p = keysAtom.start + keysAtom.headerSize + 4;
  const count = moov.readUInt32BE(p);
  p += 4;
  for (let i = 0; i < count && p + 8 <= keysAtom.start + keysAtom.size; i++) {
    const size = moov.readUInt32BE(p);
    if (size < 8) break;
    keys.push(moov.toString("utf8", p + 8, p + size));
    p += size;
  }

  for (const item of atoms(moov, ilst.start + ilst.headerSize, ilst.start + ilst.size)) {
    const index = moov.readUInt32BE(item.start + 4);
    const data = child(moov, item, "data");
    const key = keys[index - 1];
    if (!data || !key) continue;
    const valueStart = data.start + data.headerSize + 8; // type + locale
    out.set(key, moov.toString("utf8", valueStart, data.start + data.size));
  }
  return out;
}

export async function readVideoMetadata(reader: ByteReader): Promise<VideoMetadata> {
  const empty: VideoMetadata = { time: null, lat: null, lng: null };
  let moov: Buffer | null;
  try {
    moov = await findMoov(reader);
  } catch {
    return empty;
  }
  if (!moov) return empty;
  const root: Atom = { type: "moov", start: 0, headerSize: 8, size: moov.length };

  let time: CaptureTime | null = null;
  let location: { lat: number; lng: number } | null = null;

  const meta = child(moov, root, "meta");
  if (meta) {
    const values = readMdta(moov, meta);
    const created = values.get("com.apple.quicktime.creationdate");
    if (created) {
      const m = /^(.{19})(Z|[+-]\d{2}:?\d{2})?/.exec(created);
      if (m) time = interpretCaptureTime({ local: m[1], offset: m[2] });
    }
    const iso = values.get("com.apple.quicktime.location.ISO6709");
    if (iso) location = parseIso6709(iso);
  }

  if (!location) {
    const udta = child(moov, root, "udta");
    const xyz = udta && child(moov, udta, "©xyz");
    if (xyz) location = parseIso6709(moov.toString("utf8", xyz.start + xyz.headerSize + 4, xyz.start + xyz.size));
  }

  if (!time) {
    const mvhd = child(moov, root, "mvhd");
    if (mvhd) {
      const body = mvhd.start + mvhd.headerSize;
      const version = moov.readUInt8(body);
      const seconds = version === 1 ? Number(moov.readBigUInt64BE(body + 4)) : moov.readUInt32BE(body + 4);
      // 0 means the encoder left it unset.
      if (seconds > MAC_EPOCH_OFFSET) {
        time = { capturedAt: new Date((seconds - MAC_EPOCH_OFFSET) * 1000), tzOffset: null };
      }
    }
  }

  return { time, lat: location?.lat ?? null, lng: location?.lng ?? null };
}
