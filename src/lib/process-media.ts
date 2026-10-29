import { and, eq, isNull, sql } from "drizzle-orm";
import { withUser, type Tx } from "@/db";
import { media, moments, type Derived } from "@/db/schema";
import { deriveImages } from "./derive";
import { reverseGeocode } from "./geocode";
import { isHeic } from "./media-kind";
import { readPhotoMetadata } from "./metadata/exif";
import { readVideoMetadata } from "./metadata/quicktime";
import { derivedKey, getObjectBytes, headObject, putObject, rangeReader } from "./storage";

export type ProcessPayload = { ownerId: string; mediaId: string };

// The background job behind every upload: read when and where from the
// file, decode HEIC, write the derived sizes, look up the place name.
// Safe to retry: it only ever reads the original and overwrites its own
// derived copies.
export async function processMedia({ ownerId, mediaId }: ProcessPayload) {
  const [row] = await withUser(ownerId, (tx) =>
    tx.select().from(media).where(and(eq(media.id, mediaId), isNull(media.deletedAt))),
  );
  if (!row || row.status === "pending" || row.status === "ready" || !row.originalKey) return { skipped: true };

  await withUser(ownerId, (tx) =>
    tx.update(media).set({ status: "processing", processingError: null }).where(eq(media.id, mediaId)),
  );

  try {
    const contentType = row.contentType ?? "application/octet-stream";
    const update: Partial<typeof media.$inferInsert> = { status: "ready" };
    let meta: { time: { capturedAt: Date; tzOffset: number | null } | null; lat: number | null; lng: number | null } | null =
      null;

    if (row.kind === "photo") {
      const bytes = await getObjectBytes(row.originalKey);
      meta = await readPhotoMetadata(bytes);
      const { width, height, images } = await deriveImages(bytes, isHeic(contentType));
      const derived: Derived = {};
      for (const img of images) {
        const key = derivedKey(ownerId, mediaId, img.size);
        await putObject(key, img.bytes, "image/webp");
        derived[img.size] = { key, width: img.width, height: img.height };
      }
      Object.assign(update, { width, height, derived });
    } else if (row.kind === "video") {
      const head = await headObject(row.originalKey);
      if (head) meta = await readVideoMetadata(rangeReader(row.originalKey, head.size));
    }

    // The file's own metadata beats the client's hint, which beats upload time.
    if (meta?.time) {
      update.capturedAt = meta.time.capturedAt;
      update.capturedAtSource = row.kind === "video" ? "quicktime" : "exif";
      // A UTC-only time (no zone in the file) keeps the client's offset.
      update.capturedTzOffset = meta.time.tzOffset ?? row.capturedTzOffset;
    }
    if (meta?.lat != null && meta?.lng != null) {
      update.lat = meta.lat;
      update.lng = meta.lng;
    }
    const lat = update.lat ?? row.lat;
    const lng = update.lng ?? row.lng;
    if (lat != null && lng != null) {
      update.placeName = await reverseGeocode(lat, lng).catch(() => null);
    }

    await withUser(ownerId, async (tx) => {
      await tx.update(media).set(update).where(eq(media.id, mediaId));
      if (row.momentId) await refreshMomentDates(tx, row.momentId);
    });
    return { skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await withUser(ownerId, (tx) =>
      tx.update(media).set({ status: "failed", processingError: message.slice(0, 500) }).where(eq(media.id, mediaId)),
    );
    throw err;
  }
}

// A moment spans the earliest to latest local capture day of its media.
// Items whose only time is the upload time (a voice memo recorded now about
// last week's photos) are left out, unless nothing has a real capture time.
async function refreshMomentDates(tx: Tx, momentId: string) {
  const localDay = sql`((${media.capturedAt} at time zone 'UTC') + make_interval(mins => coalesce(${media.capturedTzOffset}, 0)::int))::date`;
  const span = (fn: "min" | "max") => sql`(
    select ${sql.raw(fn)}(${localDay}) from ${media}
    where ${media.momentId} = ${momentId} and ${media.capturedAt} is not null and ${media.deletedAt} is null
      and (${media.capturedAtSource} <> 'upload' or not exists (
        select 1 from ${media} m2 where m2.moment_id = ${momentId} and m2.captured_at_source <> 'upload' and m2.deleted_at is null
      ))
  )`;
  await tx
    .update(moments)
    .set({ startsOn: span("min"), endsOn: span("max") })
    .where(
      and(
        eq(moments.id, momentId),
        sql`exists (select 1 from ${media} where ${media.momentId} = ${momentId} and ${media.capturedAt} is not null)`,
      ),
    );
}
