import { describe, expect, it } from "vitest";
import {
  clientOffset,
  confirmTime,
  interpretCaptureTime,
  localDay,
  parseOffset,
  placeInZone,
} from "@/lib/metadata/capture-time";

describe("parseOffset", () => {
  it("reads the forms cameras write", () => {
    expect(parseOffset("+03:00")).toBe(180);
    expect(parseOffset("-0530")).toBe(-330);
    expect(parseOffset("Z")).toBe(0);
    expect(parseOffset("junk")).toBeNull();
  });
});

describe("interpretCaptureTime", () => {
  it("uses the explicit offset", () => {
    const t = interpretCaptureTime({ local: "2026:09:14 01:05:22", offset: "+03:00" });
    expect(t?.capturedAt.toISOString()).toBe("2026-09-13T22:05:22.000Z");
    expect(t?.tzOffset).toBe(180);
  });

  it("derives the offset from the GPS clock when there is no offset tag", () => {
    const t = interpretCaptureTime({
      local: "2019:10:20 18:34:30",
      gpsUtc: new Date("2019-10-20T16:34:29Z"),
    });
    expect(t?.tzOffset).toBe(120);
    expect(t?.capturedAt.toISOString()).toBe("2019-10-20T16:34:30.000Z");
  });

  it("keeps the wall clock when the zone is unknown, so the local day is still right", () => {
    const t = interpretCaptureTime({ local: "2026:09:14 01:05:22" });
    expect(t?.tzOffset).toBeNull();
    expect(localDay(t!.capturedAt, t!.tzOffset)).toBe("2026-09-14");
  });

  it("rejects empty camera dates", () => {
    expect(interpretCaptureTime({ local: "0000:00:00 00:00:00" })).toBeNull();
  });
});

describe("localDay", () => {
  it("puts a 1am Athens photo on that Athens day", () => {
    expect(localDay(new Date("2026-09-13T22:05:22Z"), 180)).toBe("2026-09-14");
  });
});

describe("clientOffset", () => {
  it("reads the zone from the time the phone sent", () => {
    expect(clientOffset("2026-11-03T18:30:00-08:00")).toBe(-480);
    expect(clientOffset("2026-11-03T18:30:00.123+0530")).toBe(330);
    expect(clientOffset("2026-11-03T18:30:00")).toBeNull();
    expect(clientOffset(undefined)).toBeNull();
  });
});

describe("confirmTime", () => {
  // 18:30 in California on 3 November is already 4 November in UTC.
  const now = new Date("2026-11-04T02:30:00Z");

  it("puts a voice memo with no metadata on the phone's local day", () => {
    const t = confirmTime({ sentAt: "2026-11-03T18:30:00-08:00", now });
    expect(t).toMatchObject({ capturedAt: now, tzOffset: -480, source: "upload" });
    expect(localDay(t.capturedAt, t.tzOffset)).toBe("2026-11-03");
  });

  it("reads a capture hint with no zone in the phone's zone", () => {
    const t = confirmTime({ capturedAt: "2026-11-03T21:00:00", sentAt: "2026-11-03T22:00:00-08:00", now });
    expect(t.capturedAt.toISOString()).toBe("2026-11-04T05:00:00.000Z");
    expect(t).toMatchObject({ tzOffset: -480, source: "client" });
    expect(localDay(t.capturedAt, t.tzOffset)).toBe("2026-11-03");
  });

  it("trusts a hint that carries its own zone", () => {
    const t = confirmTime({ capturedAt: "2026-09-14T01:05:22+03:00", sentAt: "2026-11-03T18:30:00-08:00", now });
    expect(t).toMatchObject({ tzOffset: 180, source: "client" });
    expect(localDay(t.capturedAt, t.tzOffset)).toBe("2026-09-14");
  });

  it("falls back to UTC when nobody says which zone", () => {
    expect(confirmTime({ now })).toMatchObject({ capturedAt: now, tzOffset: null, source: "upload" });
    expect(confirmTime({ capturedAt: "2026-11-03T21:00:00", now })).toMatchObject({ tzOffset: 0 });
  });
});

describe("placeInZone", () => {
  it("re-reads a floating EXIF time in the phone's zone", () => {
    const t = placeInZone(interpretCaptureTime({ local: "2026:11:03 21:00:00" })!, -480);
    expect(t.capturedAt.toISOString()).toBe("2026-11-04T05:00:00.000Z");
    expect(localDay(t.capturedAt, t.tzOffset)).toBe("2026-11-03");
  });

  it("leaves a time that already has a zone, or a true UTC time, alone", () => {
    const zoned = interpretCaptureTime({ local: "2026:09:14 01:05:22", offset: "+03:00" })!;
    expect(placeInZone(zoned, -480)).toBe(zoned);
    const utc = { capturedAt: new Date("2026-11-04T05:00:00Z"), tzOffset: null };
    expect(placeInZone(utc, -480)).toBe(utc);
  });
});
