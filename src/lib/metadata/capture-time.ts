export type CaptureTime = { capturedAt: Date; tzOffset: number | null };

// "+03:00", "+0300", "-05:30", "Z" -> minutes east of UTC.
export function parseOffset(value: string | null | undefined): number | null {
  if (!value) return null;
  const v = value.trim();
  if (v === "Z") return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(v);
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -minutes : minutes;
}

// EXIF "2026:09:14 13:05:22" or ISO-ish "2026-09-14T13:05:22" -> wall-clock
// parts. Returns the wall time as if it were UTC (milliseconds).
export function parseWallClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  if (y < 1900 || mo < 1 || mo > 12) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

// Combine a local wall-clock time with whatever tells us the offset:
// an explicit offset tag first, else the GPS clock (always UTC), which
// gives the offset by difference, rounded to the nearest 15 minutes.
export function interpretCaptureTime(input: {
  local?: string | null;
  offset?: string | null;
  gpsUtc?: Date | null;
}): CaptureTime | null {
  const wall = parseWallClock(input.local);
  if (wall === null) return null;

  let tzOffset = parseOffset(input.offset);
  if (tzOffset === null && input.gpsUtc && !Number.isNaN(input.gpsUtc.getTime())) {
    const diff = Math.round((wall - input.gpsUtc.getTime()) / 60000 / 15) * 15;
    if (Math.abs(diff) <= 14 * 60) tzOffset = diff;
  }

  // Unknown offset: keep the wall-clock time as UTC. The local day is then
  // still right, which is what chapters and date spans use.
  const capturedAt = new Date(wall - (tzOffset ?? 0) * 60000);
  return { capturedAt, tzOffset };
}

// The calendar day where the item was taken (YYYY-MM-DD).
export function localDay(capturedAt: Date, tzOffset: number | null): string {
  return new Date(capturedAt.getTime() + (tzOffset ?? 0) * 60000).toISOString().slice(0, 10);
}
