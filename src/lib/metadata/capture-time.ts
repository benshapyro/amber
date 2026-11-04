// `floating` means the file gave a wall-clock time with no zone, so
// capturedAt holds that wall clock as if it were UTC. Unlike a true UTC
// time (a video's mvhd clock), it can be re-read in a known zone later.
export type CaptureTime = { capturedAt: Date; tzOffset: number | null; floating?: boolean };

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
  return tzOffset === null ? { capturedAt, tzOffset, floating: true } : { capturedAt, tzOffset };
}

// A floating wall-clock time read in a zone learned elsewhere (the phone's
// offset when it sent the file). Anything else is returned unchanged.
export function placeInZone(time: CaptureTime, tzOffset: number | null): CaptureTime {
  if (!time.floating || tzOffset === null) return time;
  return { capturedAt: new Date(time.capturedAt.getTime() - tzOffset * 60000), tzOffset };
}

const CLIENT_TIME = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

// The phone's own UTC offset, from the time it says it sent the file
// ("2026-11-03T18:30:00-08:00"). Null when it gave no zone.
export function clientOffset(sentAt: string | null | undefined): number | null {
  const m = sentAt ? CLIENT_TIME.exec(sentAt.trim()) : null;
  return m ? parseOffset(m[2]) : null;
}

// What confirm records before the background job reads the file: the
// client's capture-time hint if it sent one, else the upload time. Both are
// placed in the phone's zone, so a voice memo recorded on a California
// evening lands on that California day, not on tomorrow in UTC.
export function confirmTime(input: { capturedAt?: string | null; sentAt?: string | null; now: Date }): {
  capturedAt: Date;
  tzOffset: number | null;
  source: "client" | "upload";
} {
  const phone = clientOffset(input.sentAt);
  const m = input.capturedAt ? CLIENT_TIME.exec(input.capturedAt.trim()) : null;
  const hint = m ? interpretCaptureTime({ local: m[1], offset: m[2] ?? null }) : null;
  if (hint) {
    const placed = placeInZone(hint, phone);
    // No zone anywhere: fall back to UTC, as before.
    return { capturedAt: placed.capturedAt, tzOffset: placed.tzOffset ?? 0, source: "client" };
  }
  return { capturedAt: input.now, tzOffset: phone, source: "upload" };
}

// The calendar day where the item was taken (YYYY-MM-DD).
export function localDay(capturedAt: Date, tzOffset: number | null): string {
  return new Date(capturedAt.getTime() + (tzOffset ?? 0) * 60000).toISOString().slice(0, 10);
}
