import { describe, expect, it } from "vitest";
import { extensionOf, kindFor, resolveContentType, sniffContentType } from "@/lib/media-kind";

describe("media kinds", () => {
  it("infers a type from the extension when the client sends none", () => {
    expect(resolveContentType("IMG_0001.HEIC")).toBe("image/heic");
    expect(resolveContentType("clip.MOV", "application/octet-stream")).toBe("video/quicktime");
    expect(resolveContentType("memo.m4a", "audio/x-m4a; codecs=aac")).toBe("audio/x-m4a");
    expect(resolveContentType("ticket")).toBe("application/octet-stream");
  });

  it("maps types to the spec's media kinds", () => {
    expect(kindFor("image/heic")).toBe("photo");
    expect(kindFor("video/quicktime")).toBe("video");
    expect(kindFor("audio/mp4")).toBe("audio");
    expect(kindFor("application/pdf")).toBe("file");
    expect(kindFor("image/x-adobe-dng")).toBe("file");
  });

  it("reads extensions safely", () => {
    expect(extensionOf("a.b.JPG")).toBe("jpg");
    expect(extensionOf("noext")).toBe("");
  });
});

describe("sniffContentType", () => {
  const iso = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}`)]);
  it("recognises what an iPhone produces from the first bytes", () => {
    expect(sniffContentType(iso("heic"))).toBe("image/heic");
    expect(sniffContentType(iso("qt  "))).toBe("video/quicktime");
    expect(sniffContentType(iso("M4A "))).toBe("audio/mp4");
    expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe1]))).toBe("image/jpeg");
    expect(sniffContentType(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffContentType(Buffer.from("hello world!"))).toBeNull();
  });
});
