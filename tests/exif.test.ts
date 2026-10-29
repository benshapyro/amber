import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { deriveImages } from "@/lib/derive";
import { readPhotoMetadata } from "@/lib/metadata/exif";

async function jpegWithExif() {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#d4a853" } })
    .withExif({
      IFD0: { Make: "Apple", Model: "iPhone" },
      IFD2: { DateTimeOriginal: "2026:09:14 01:05:22", OffsetTimeOriginal: "+03:00" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "37/1 58/1 1740/100",
        GPSLongitudeRef: "E",
        GPSLongitude: "23/1 43/1 3240/100",
      },
    })
    .jpeg()
    .toBuffer();
}

describe("photo metadata", () => {
  it("reads time, zone and GPS from a JPEG", async () => {
    const meta = await readPhotoMetadata(await jpegWithExif());
    expect(meta.time?.capturedAt.toISOString()).toBe("2026-09-13T22:05:22.000Z");
    expect(meta.time?.tzOffset).toBe(180);
    expect(meta.lat).toBeCloseTo(37.9715, 3);
    expect(meta.lng).toBeCloseTo(23.7257, 3);
  });

  it("returns nothing, not an error, for a file with no EXIF", async () => {
    const bare = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    expect(await readPhotoMetadata(bare)).toEqual({ time: null, lat: null, lng: null });
  });

  it("writes three sizes without enlarging and without EXIF", async () => {
    const { width, height, images } = await deriveImages(await jpegWithExif(), false);
    expect([width, height]).toEqual([3000, 2000]);
    expect(images.map((i) => [i.size, i.width, i.height])).toEqual([
      ["thumb", 640, 427],
      ["page", 1600, 1067],
      ["full", 2560, 1707],
    ]);
    const meta = await sharp(images[2].bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
  });
});

// Real iPhone HEIC files are too large to commit. Point at one to run this:
//   AMBER_HEIC_FIXTURE=/path/to/IMG_0001.HEIC pnpm test
const heic = process.env.AMBER_HEIC_FIXTURE;
describe.skipIf(!heic || !existsSync(heic))("HEIC", () => {
  it("decodes an iPhone HEIC and reads its metadata", async () => {
    const bytes = readFileSync(heic!);
    const meta = await readPhotoMetadata(bytes);
    expect(meta.time).not.toBeNull();
    const { images } = await deriveImages(bytes, true);
    expect(images).toHaveLength(3);
    expect((await sharp(images[0].bytes).metadata()).icc).toBeDefined();
  });
});
