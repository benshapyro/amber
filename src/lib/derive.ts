import decodeHeic from "heic-decode";
import sharp from "sharp";
import type { DerivedSize } from "@/db/schema";

// Long-edge sizes for the copies the app actually shows. The original is
// never modified; these are regenerated from it whenever needed.
export const SIZES: Record<DerivedSize, number> = {
  thumb: 640,
  page: 1600,
  full: 2560,
};

export type DerivedImage = { size: DerivedSize; bytes: Buffer; width: number; height: number };

// Sharp's prebuilt binary cannot decode HEIC (HEVC is patent-encumbered and
// left out). libheif compiled to WebAssembly can, with no custom build, so
// HEIC goes through it first and reaches Sharp as raw pixels. libheif
// applies the rotation stored in the file while decoding, but the colour
// profile is lost on the way, so HEIC output is tagged Display P3: the
// space every iPhone HEIC is shot in.
async function open(bytes: Buffer, heic: boolean) {
  if (heic) {
    const { width, height, data } = await decodeHeic({ buffer: bytes });
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
    });
  }
  // .rotate() with no argument applies the EXIF orientation.
  return sharp(bytes, { failOn: "none" }).rotate();
}

// Derived copies carry no EXIF (Sharp drops it unless asked), so a shared
// image never leaks GPS. The original keeps everything.
export async function deriveImages(bytes: Buffer, heic: boolean) {
  const base = await open(bytes, heic);
  const profile = heic ? "p3" : "srgb";
  // Materialise once so each size resizes from decoded pixels instead of
  // decoding the original three times.
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const raw = { width: info.width, height: info.height, channels: info.channels };

  const out: DerivedImage[] = [];
  for (const [size, edge] of Object.entries(SIZES) as [DerivedSize, number][]) {
    const { data: webp, info: dims } = await sharp(data, { raw })
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .withIccProfile(profile)
      .webp({ quality: size === "thumb" ? 72 : 82 })
      .toBuffer({ resolveWithObject: true });
    out.push({ size, bytes: webp, width: dims.width, height: dims.height });
  }
  return { width: info.width, height: info.height, images: out };
}
