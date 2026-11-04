import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb, withUser } from "@/db";
import { media, user } from "@/db/schema";
import { logActivity } from "./activity";
import type { Caller } from "./caller";
import { confirmUpload } from "./capture";
import { enqueueProcessing } from "./jobs";
import { headObject } from "./storage";

// Upload URLs last an hour, so anything still pending after a day was
// abandoned: the phone lost signal between the PUT and the confirm, or the
// PUT never happened.
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Never lose a photo: if the file did land in storage, finish the upload
// into the Inbox. If it never arrived, hide the empty row (soft delete).
export async function sweepAbandonedUploads(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const owners = await getDb().select({ id: user.id }).from(user);
  const result = { recovered: 0, removed: 0 };

  for (const owner of owners) {
    const caller: Caller = {
      userId: owner.id,
      actor: "upload cleanup",
      apiKeyId: null,
      source: "cleanup",
      scopes: new Set(["draft"]),
    };
    const stale = await withUser(owner.id, (tx) =>
      tx
        .select({ id: media.id, key: media.originalKey })
        .from(media)
        .where(and(eq(media.status, "pending"), isNull(media.deletedAt), lt(media.createdAt, cutoff))),
    );

    for (const row of stale) {
      const landed = row.key ? await headObject(row.key) : null;
      if (landed) {
        const { enqueue } = await confirmUpload(caller, row.id, {});
        if (enqueue) await enqueueProcessing({ ownerId: owner.id, mediaId: row.id });
        result.recovered += 1;
      } else {
        await withUser(owner.id, async (tx) => {
          await tx.update(media).set({ deletedAt: now }).where(eq(media.id, row.id));
          await logActivity(tx, caller, { action: "media.abandoned", recordType: "media", recordId: row.id });
        });
        result.removed += 1;
      }
    }
  }
  return result;
}
