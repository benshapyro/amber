import { sql } from "drizzle-orm";
import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgRole,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

// Created in drizzle/0000_roles.sql. The app logs in as this role.
export const amberApp = pgRole("amber_app").existing();

// Every owner table gets the same rule: a row is visible and writable only
// when its owner_id matches the user the request set with withUser().
// With no user set, current_setting returns '' and nothing matches.
const currentUser = sql`nullif(current_setting('app.user_id', true), '')::uuid`;
const ownerPolicy = (table: string) =>
  pgPolicy(`${table}_owner`, {
    as: "permissive",
    for: "all",
    to: amberApp,
    using: sql`owner_id = ${currentUser}`,
    withCheck: sql`owner_id = ${currentUser}`,
  });

const ownerId = () =>
  uuid("owner_id")
    .notNull()
    .references(() => user.id);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  // Soft delete: hidden now, erased after 30 days by a later cleanup job.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export type MomentKind = "moment" | "period_note";
export type MomentStatus = "draft" | "kept";
export type MediaKind = "photo" | "video" | "audio" | "file" | "link";
export type MediaStatus = "pending" | "uploaded" | "processing" | "ready" | "failed";
export type DerivedSize = "thumb" | "page" | "full";
export type Derived = Partial<Record<DerivedSize, { key: string; width: number; height: number }>>;

export const moments = pgTable(
  "moments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    kind: text("kind").$type<MomentKind>().notNull().default("moment"),
    period: text("period").$type<"week" | "month">(),
    status: text("status").$type<MomentStatus>().notNull().default("draft"),
    title: text("title"),
    body: text("body"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    // `web`, `shortcut`, `api:<key name>`, `import`
    source: text("source").notNull(),
    // One Shortcut run (several files plus one note) shares a capture id,
    // so every confirm in that run lands on the same draft moment.
    captureId: uuid("capture_id"),
    aiModel: text("ai_model"),
    aiPromptVersion: text("ai_prompt_version"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("moments_owner_capture_idx").on(t.ownerId, t.captureId),
    index("moments_owner_status_idx").on(t.ownerId, t.status),
    ownerPolicy("moments"),
  ],
).enableRLS();

export const media = pgTable(
  "media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    // Null means the item is in the Inbox.
    momentId: uuid("moment_id").references(() => moments.id),
    kind: text("kind").$type<MediaKind>().notNull(),
    status: text("status").$type<MediaStatus>().notNull().default("pending"),
    originalKey: text("original_key"),
    originalFilename: text("original_filename"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    derived: jsonb("derived").$type<Derived>(),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    // Minutes east of UTC where it was taken, so the local day can be
    // recovered (a 1am photo in Athens belongs to that Athens day).
    capturedTzOffset: smallint("captured_tz_offset"),
    capturedAtSource: text("captured_at_source").$type<"exif" | "quicktime" | "client" | "upload">(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    placeName: text("place_name"),
    caption: text("caption"),
    transcript: text("transcript"),
    url: text("url"),
    deviceName: text("device_name"),
    source: text("source").notNull(),
    processingError: text("processing_error"),
    ...timestamps,
  },
  (t) => [
    index("media_owner_inbox_idx").on(t.ownerId, t.momentId, t.capturedAt),
    ownerPolicy("media"),
  ],
).enableRLS();

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: ownerId(),
    // "Ben" for a signed-in session, or the API key's name.
    actor: text("actor").notNull(),
    apiKeyId: uuid("api_key_id"),
    action: text("action").notNull(),
    recordType: text("record_type").notNull(),
    recordId: uuid("record_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("activity_owner_created_idx").on(t.ownerId, t.createdAt), ownerPolicy("activity_log")],
).enableRLS();

// Coordinates rounded to ~100 m mapped to a place name. Holds no identity,
// so it is shared rather than owner-scoped.
export const geocodeCache = pgTable("geocode_cache", {
  key: text("key").primaryKey(),
  placeName: text("place_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
