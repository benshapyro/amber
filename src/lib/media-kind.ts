import type { MediaKind } from "@/db/schema";

// iOS Shortcuts cannot always tell us a MIME type, so it can be inferred
// from the file extension.
const BY_EXTENSION: Record<string, string> = {
  heic: "image/heic",
  heif: "image/heif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  dng: "image/x-adobe-dng",
  mov: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  caf: "audio/x-caf",
  pdf: "application/pdf",
};

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : "";
}

export function resolveContentType(filename: string, given?: string | null): string {
  const clean = given?.split(";")[0].trim().toLowerCase();
  if (clean && clean !== "application/octet-stream") return clean;
  return BY_EXTENSION[extensionOf(filename)] ?? "application/octet-stream";
}

export function kindFor(contentType: string): Exclude<MediaKind, "link"> {
  if (contentType === "image/x-adobe-dng") return "file";
  if (contentType.startsWith("image/")) return "photo";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return "file";
}

export function isHeic(contentType: string) {
  return contentType === "image/heic" || contentType === "image/heif";
}

// When the client could not say what a file is, look at its first bytes.
// ISO media files (HEIC, MOV, MP4, M4A) name their brand at offset 4.
export function sniffContentType(head: Buffer): string | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (head.length >= 5 && head.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp") {
    const brand = head.toString("latin1", 8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return "image/heic";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
    if (brand === "avif") return "image/avif";
    if (brand === "qt  ") return "video/quicktime";
    if (brand.startsWith("M4A")) return "audio/mp4";
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(brand)) return "video/mp4";
  }
  return null;
}
