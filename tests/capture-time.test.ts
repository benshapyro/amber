import { describe, expect, it } from "vitest";
import { interpretCaptureTime, localDay, parseOffset } from "@/lib/metadata/capture-time";

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
