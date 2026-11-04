import { describe, expect, it } from "vitest";
import { bufferReader, parseIso6709, readVideoMetadata } from "@/lib/metadata/quicktime";

function atom(type: string, ...children: Buffer[]) {
  const body = Buffer.concat(children);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, body]);
}

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function mvhd(unixSeconds: number) {
  const body = Buffer.alloc(100);
  body.writeUInt32BE(unixSeconds + 2082844800, 4); // creation_time, version 0
  return atom("mvhd", body);
}

// Apple's mdta layout: keys list plus ilst entries numbered by key index.
function appleMeta(values: Record<string, string>) {
  const names = Object.keys(values);
  const keys = atom(
    "keys",
    u32(0),
    u32(names.length),
    ...names.map((n) => Buffer.concat([u32(8 + Buffer.byteLength(n)), Buffer.from("mdta"), Buffer.from(n)])),
  );
  const items = names.map((n, i) => {
    const data = atom("data", u32(1), u32(0), Buffer.from(values[n]));
    const item = atom("xxxx", data);
    item.writeUInt32BE(i + 1, 4);
    return item;
  });
  return atom("meta", atom("hdlr", Buffer.alloc(25)), keys, atom("ilst", ...items));
}

describe("QuickTime metadata", () => {
  it("reads Apple's creation date with zone and ISO 6709 location", async () => {
    const file = Buffer.concat([
      atom("ftyp", Buffer.from("qt  "), u32(0)),
      atom("mdat", Buffer.alloc(4096)),
      atom(
        "moov",
        mvhd(Date.UTC(2026, 8, 13, 22, 5, 22) / 1000),
        appleMeta({
          "com.apple.quicktime.make": "Apple",
          "com.apple.quicktime.creationdate": "2026-09-14T01:05:22+0300",
          "com.apple.quicktime.location.ISO6709": "+37.9715+023.7257+070.000/",
        }),
      ),
    ]);
    const meta = await readVideoMetadata(bufferReader(file));
    expect(meta.time?.capturedAt.toISOString()).toBe("2026-09-13T22:05:22.000Z");
    expect(meta.time?.tzOffset).toBe(180);
    expect(meta.lat).toBeCloseTo(37.9715);
    expect(meta.lng).toBeCloseTo(23.7257);
  });

  it("falls back to mvhd's UTC time when there is no Apple metadata", async () => {
    const file = Buffer.concat([atom("ftyp", Buffer.from("isom"), u32(0)), atom("moov", mvhd(1_790_000_000))]);
    const meta = await readVideoMetadata(bufferReader(file));
    expect(meta.time?.capturedAt.getTime()).toBe(1_790_000_000_000);
    expect(meta.time?.tzOffset).toBeNull();
    expect(meta.lat).toBeNull();
  });

  it("survives a file that is not a video", async () => {
    const meta = await readVideoMetadata(bufferReader(Buffer.from("not a quicktime file at all")));
    expect(meta).toEqual({ time: null, lat: null, lng: null });
  });

  it("parses ISO 6709 strings", () => {
    expect(parseIso6709("-33.8688+151.2093/")).toEqual({ lat: -33.8688, lng: 151.2093 });
    expect(parseIso6709("nope")).toBeNull();
  });
});
