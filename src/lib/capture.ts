import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { withUser, type Tx } from "@/db";
import { media, moments, type Derived } from "@/db/schema";
import { logActivity } from "./activity";
import type { Caller, Scope } from "./caller";
import { HttpError } from "./errors";
import { interpretCaptureTime } from "./metadata/capture-time";
import { extensionOf, kindFor, resolveContentType, sniffContentType } from "./media-kind";
import { headObject, originalKey, readHead, signUpload, signView, UPLOAD_URL_TTL_SECONDS } from "./storage";

// A single R2 PUT tops out at 5 GB.
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3;

export function requireScope(caller: Caller, scope: Scope) {
  if (!caller.scopes.has(scope)) throw new HttpError(403, `This key needs the "${scope}" scope.`);
}

// ---------------------------------------------------------------------------
// Step 1: POST /api/media/upload-url

export const uploadUrlInput = z.object({
  filename: z.string().trim().min(1).max(255),
  // Optional because iOS Shortcuts cannot always report these reliably.
  size: z.coerce.number().int().positive().optional(),
  content_type: z.string().max(255).optional(),
});

export async function createUploadSlot(caller: Caller, input: z.infer<typeof uploadUrlInput>) {
  requireScope(caller, "draft");
  if (input.size && input.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "File is larger than 5 GB.");

  const contentType = resolveContentType(input.filename, input.content_type);
  const id = randomUUID();
  const key = originalKey(caller.userId, id, extensionOf(input.filename));

  await withUser(caller.userId, (tx) =>
    tx.insert(media).values({
      id,
      ownerId: caller.userId,
      kind: kindFor(contentType),
      status: "pending",
      originalKey: key,
      originalFilename: input.filename,
      contentType,
      sizeBytes: input.size,
      source: caller.source,
    }),
  );

  return {
    media_id: id,
    upload_url: await signUpload(key, contentType),
    method: "PUT" as const,
    content_type: contentType,
    // The signature covers Content-Type, so the PUT must send exactly this.
    headers: { "Content-Type": contentType },
    expires_in: UPLOAD_URL_TTL_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// Step 3: POST /api/media/{id}/confirm

export const confirmInput = z.object({
  // A line typed in the Shortcut, or a note from the web.
  note: z.string().max(20_000).optional(),
  // True when this file is the note itself. An audio file sent with a
  // capture_id counts as the note without it (the Shortcut's voice memo).
  is_note: z.boolean().optional(),
  // Shared by every file in one Shortcut run, so they land on one moment.
  // Any short string: Shortcuts has no UUID action, so it sends a timestamp
  // plus a random number, which is turned into a stable UUID below.
  capture_id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:-]{6,64}$/)
    .optional(),
  device: z.string().max(100).optional(),
  // Fallbacks for when the file carries no metadata. The file wins.
  captured_at: z.string().max(40).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export type ConfirmInput = z.infer<typeof confirmInput>;

// Same client string, same owner -> same UUID, so retries and parallel
// confirms all find the one moment.
export function captureUuid(ownerId: string, captureId: string) {
  const h = createHash("sha256").update(`${ownerId}:${captureId}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5 layout
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function clientTime(value: string | undefined) {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
  return m ? interpretCaptureTime({ local: m[1], offset: m[2] ?? "Z" }) : null;
}

// Media with a note becomes a draft moment; media alone goes to the Inbox.
async function momentFor(
  tx: Tx,
  caller: Caller,
  input: ConfirmInput,
  kind: string,
  today: string,
): Promise<string | null> {
  const note = input.note?.trim() || null;
  const voiceMemo = Boolean(input.capture_id) && kind === "audio";
  const hasNote = Boolean(note) || input.is_note === true || voiceMemo;

  if (!input.capture_id) {
    if (!hasNote) return null;
    const [row] = await tx
      .insert(moments)
      .values({ ownerId: caller.userId, body: note, source: caller.source, startsOn: today, endsOn: today })
      .returning({ id: moments.id });
    await logActivity(tx, caller, { action: "moment.draft_created", recordType: "moment", recordId: row.id });
    return row.id;
  }

  const captureId = captureUuid(caller.userId, input.capture_id);
  const [existing] = await tx
    .select({ id: moments.id, body: moments.body })
    .from(moments)
    .where(and(eq(moments.ownerId, caller.userId), eq(moments.captureId, captureId)));
  if (existing) {
    if (note && !existing.body) await tx.update(moments).set({ body: note }).where(eq(moments.id, existing.id));
    return existing.id;
  }
  if (!hasNote) return null;

  // Two files from the same run can confirm at once; the unique index on
  // (owner_id, capture_id) makes exactly one of them create the moment.
  const [row] = await tx
    .insert(moments)
    .values({
      ownerId: caller.userId,
      body: note,
      captureId,
      source: caller.source,
      startsOn: today,
      endsOn: today,
    })
    .onConflictDoUpdate({
      target: [moments.ownerId, moments.captureId],
      set: { body: sql`coalesce(${moments.body}, excluded.body)` },
    })
    .returning({ id: moments.id });
  await logActivity(tx, caller, { action: "moment.draft_created", recordType: "moment", recordId: row.id });
  return row.id;
}

export async function confirmUpload(caller: Caller, mediaId: string, input: ConfirmInput) {
  requireScope(caller, "draft");

  const result = await withUser(caller.userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(media)
      .where(and(eq(media.id, mediaId), isNull(media.deletedAt)))
      .for("update");
    if (!row) throw new HttpError(404, "No such upload.");
    // Retrying a confirm is harmless: the Shortcut may run it twice. It
    // re-queues processing if the first attempt never started or failed.
    if (row.status !== "pending") return { row, enqueue: row.status === "uploaded" || row.status === "failed" };

    const head = await headObject(row.originalKey!);
    if (!head) throw new HttpError(409, "The file has not arrived yet. PUT it to the upload URL first.");
    if (head.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "File is larger than 5 GB.");

    // A client that could not name the type sent octet-stream; look inside.
    let contentType = row.contentType ?? "application/octet-stream";
    if (contentType === "application/octet-stream") {
      contentType = sniffContentType(await readHead(row.originalKey!)) ?? contentType;
    }

    const hint = clientTime(input.captured_at);
    const now = new Date();
    const capturedAt = hint?.capturedAt ?? now;
    const tzOffset = hint?.tzOffset ?? null;
    const today = new Date(capturedAt.getTime() + (tzOffset ?? 0) * 60000).toISOString().slice(0, 10);

    const momentId = await momentFor(tx, caller, input, kindFor(contentType), today);
    const [updated] = await tx
      .update(media)
      .set({
        status: "uploaded",
        sizeBytes: head.size,
        contentType,
        kind: kindFor(contentType),
        momentId,
        deviceName: input.device ?? null,
        capturedAt,
        capturedTzOffset: tzOffset,
        capturedAtSource: hint ? "client" : "upload",
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      })
      .where(eq(media.id, mediaId))
      .returning();

    await logActivity(tx, caller, {
      action: "media.uploaded",
      recordType: "media",
      recordId: mediaId,
      details: { filename: row.originalFilename, size: head.size, device: input.device, momentId },
    });
    return { row: updated, enqueue: true };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Reading: GET /api/inbox, GET /api/media/{id}

export type MediaView = {
  id: string;
  kind: string;
  status: string;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  captured_at: string | null;
  captured_tz_offset: number | null;
  lat: number | null;
  lng: number | null;
  place_name: string | null;
  device: string | null;
  source: string;
  moment_id: string | null;
  error: string | null;
  urls: { thumb?: string; page?: string; full?: string; original?: string };
};

type MediaRow = typeof media.$inferSelect;

export async function toMediaView(row: MediaRow): Promise<MediaView> {
  const urls: MediaView["urls"] = {};
  const derived: Derived = row.derived ?? {};
  for (const size of ["thumb", "page", "full"] as const) {
    const d = derived[size];
    if (d) urls[size] = await signView(d.key);
  }
  if (row.originalKey && row.status !== "pending") {
    urls.original = await signView(row.originalKey, {
      downloadName: row.kind === "file" ? (row.originalFilename ?? undefined) : undefined,
      contentType: row.contentType ?? undefined,
    });
  }
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    filename: row.originalFilename,
    content_type: row.contentType,
    size: row.sizeBytes,
    width: row.width,
    height: row.height,
    captured_at: row.capturedAt?.toISOString() ?? null,
    captured_tz_offset: row.capturedTzOffset,
    lat: row.lat,
    lng: row.lng,
    place_name: row.placeName,
    device: row.deviceName,
    source: row.source,
    moment_id: row.momentId,
    error: row.processingError,
    urls,
  };
}

export async function getMedia(caller: Caller, mediaId: string) {
  requireScope(caller, "read");
  const [row] = await withUser(caller.userId, (tx) =>
    tx.select().from(media).where(and(eq(media.id, mediaId), isNull(media.deletedAt))),
  );
  if (!row) throw new HttpError(404, "No such media.");
  return toMediaView(row);
}

const sortTime = sql`coalesce(${media.capturedAt}, ${media.createdAt})`;

export async function listInbox(caller: Caller, opts: { limit?: number } = {}) {
  requireScope(caller, "read");
  const rows = await withUser(caller.userId, (tx) =>
    tx
      .select()
      .from(media)
      .where(and(isNull(media.momentId), isNull(media.deletedAt), ne(media.status, "pending")))
      .orderBy(desc(sortTime))
      .limit(Math.min(opts.limit ?? 500, 1000)),
  );
  return Promise.all(rows.map(toMediaView));
}

// Draft moments created from the phone, with their media, newest first.
// The editor that turns these into kept moments arrives in slice 4.
export async function listDrafts(caller: Caller, opts: { limit?: number } = {}) {
  requireScope(caller, "read");
  return withUser(caller.userId, async (tx) => {
    const drafts = await tx
      .select()
      .from(moments)
      .where(and(eq(moments.status, "draft"), isNull(moments.deletedAt)))
      .orderBy(desc(moments.createdAt))
      .limit(Math.min(opts.limit ?? 50, 200));
    if (drafts.length === 0) return [];
    const items = await tx
      .select()
      .from(media)
      .where(and(inArray(media.momentId, drafts.map((d) => d.id)), isNull(media.deletedAt), ne(media.status, "pending")))
      .orderBy(sortTime);
    return Promise.all(
      drafts.map(async (d) => ({
        id: d.id,
        title: d.title,
        body: d.body,
        starts_on: d.startsOn,
        ends_on: d.endsOn,
        source: d.source,
        created_at: d.createdAt.toISOString(),
        media: await Promise.all(items.filter((m) => m.momentId === d.id).map(toMediaView)),
      })),
    );
  });
}
