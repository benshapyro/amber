import exifr from "exifr";
import { interpretCaptureTime, type CaptureTime } from "./capture-time";

export type PhotoMetadata = {
  time: CaptureTime | null;
  lat: number | null;
  lng: number | null;
};

const TAGS = [
  "DateTimeOriginal",
  "CreateDate",
  "OffsetTimeOriginal",
  "OffsetTime",
  "GPSLatitude",
  "GPSLatitudeRef",
  "GPSLongitude",
  "GPSLongitudeRef",
  "GPSDateStamp",
  "GPSTimeStamp",
];

function gpsUtc(date: unknown, time: unknown): Date | null {
  if (typeof date !== "string" || !Array.isArray(time) || time.length < 3) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})$/.exec(date);
  if (!m) return null;
  const [h, mi, s] = time.map(Number);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi, Math.floor(s)));
}

function toDecimal(dms: unknown, ref: unknown): number | null {
  if (!Array.isArray(dms) || dms.length < 3) return typeof dms === "number" ? dms : null;
  const [d, m, s] = dms.map(Number);
  const value = d + m / 60 + s / 3600;
  return ref === "S" || ref === "W" ? -value : value;
}

// Reads time and GPS from JPEG, HEIC, PNG, TIFF, and WebP. Values are kept
// raw (reviveValues: false) because exifr would otherwise turn the local
// wall-clock time into a Date in the server's time zone.
export async function readPhotoMetadata(bytes: Buffer): Promise<PhotoMetadata> {
  let tags: Record<string, unknown> | undefined;
  try {
    tags = await exifr.parse(bytes, { pick: TAGS, reviveValues: false, translateValues: false });
  } catch {
    tags = undefined;
  }
  if (!tags) return { time: null, lat: null, lng: null };

  const time = interpretCaptureTime({
    local: (tags.DateTimeOriginal ?? tags.CreateDate) as string | undefined,
    offset: (tags.OffsetTimeOriginal ?? tags.OffsetTime) as string | undefined,
    gpsUtc: gpsUtc(tags.GPSDateStamp, tags.GPSTimeStamp),
  });
  const lat = toDecimal(tags.GPSLatitude, tags.GPSLatitudeRef);
  const lng = toDecimal(tags.GPSLongitude, tags.GPSLongitudeRef);
  const valid = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return { time, lat: valid ? lat : null, lng: valid ? lng : null };
}
