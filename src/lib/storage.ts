import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

// Cloudflare R2 through its S3-compatible API. Large files never pass
// through Vercel: clients PUT straight to a signed URL.

let client: S3Client | undefined;
function s3() {
  if (!client) {
    const { endpoint, accessKeyId, secretAccessKey } = env.r2;
    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      // R2 accepts both styles; path style also works with a local MinIO.
      forcePathStyle: true,
    });
  }
  return client;
}

export const UPLOAD_URL_TTL_SECONDS = 60 * 60;
export const VIEW_URL_TTL_SECONDS = 10 * 60;

export function originalKey(ownerId: string, mediaId: string, ext: string) {
  return `originals/${ownerId}/${mediaId}${ext ? `.${ext}` : ""}`;
}

export function derivedKey(ownerId: string, mediaId: string, size: string) {
  return `derived/${ownerId}/${mediaId}/${size}.webp`;
}

export function signUpload(key: string, contentType: string) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: env.r2.bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

export function signView(key: string, opts: { downloadName?: string; contentType?: string } = {}) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      // Fixes playback when the stored type is a generic octet-stream.
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: opts.downloadName
        ? `attachment; filename="${opts.downloadName.replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn: VIEW_URL_TTL_SECONDS },
  );
}

export async function headObject(key: string) {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3().send(
    new PutObjectCommand({ Bucket: env.r2.bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

// Reads parts of an object with HTTP Range requests (for video metadata).
export function rangeReader(key: string, size: number) {
  return {
    size,
    async read(offset: number, length: number): Promise<Buffer> {
      const end = Math.min(offset + length, size) - 1;
      if (end < offset) return Buffer.alloc(0);
      const res = await s3().send(
        new GetObjectCommand({ Bucket: env.r2.bucket, Key: key, Range: `bytes=${offset}-${end}` }),
      );
      return Buffer.from(await res.Body!.transformToByteArray());
    },
  };
}

export async function readHead(key: string, bytes = 64): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
  return Buffer.from(await res.Body!.transformToByteArray());
}
