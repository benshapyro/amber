# Amber

Ben's private photo journal: capture a moment from the phone, an AI drafts the words, and it reads like a book. The spec lives in the Amber project (`amber-spec.md`, v2.2). This repo is the single app: Next.js on Vercel, Neon Postgres with Drizzle, Better Auth, Cloudflare R2, and Trigger.dev for background jobs.

**Built so far: slice 2, capture to inbox.** Sign in, upload originals straight to R2 (Shortcut, web, or API), read time and place from the file, decode HEIC, write display sizes, and show it all in the Inbox. Moments, the book, and AI drafts come in later slices.

## How capture works

Every client (the iOS Shortcut, the web drop zone, agents) uses the same three calls, so nothing large ever passes through Vercel:

1. `POST /api/media/upload-url` with `{ filename, size?, content_type? }` returns `{ media_id, upload_url, content_type, headers }`.
2. `PUT` the file to `upload_url` with exactly those `headers`.
3. `POST /api/media/{media_id}/confirm` with optional `{ note, is_note, capture_id, device, captured_at, lat, lng }`.

Confirm starts the `process-media` job (`trigger/process-media.ts`): EXIF or QuickTime metadata, HEIC decode, three WebP sizes (640, 1600, 2560 px, no EXIF in them), and a Mapbox place name. Media with a note becomes a draft moment; media alone goes to the Inbox. Files from one Shortcut run share a `capture_id`, so they all land on the same draft. If the file has no capture time, the `captured_at` hint is used, then the upload time.

Other routes: `GET /api/inbox`, `GET /api/media/{id}`. Auth is either Ben's session cookie or `Authorization: Bearer <api key>`. Device tokens (Settings > Devices) carry only the `draft` scope: they can add to the Inbox and start drafts, and cannot read.

## Privacy and safety

- **Row-level security that actually applies.** The app connects as `amber_app`, a role that owns no tables and cannot bypass RLS. Each request sets `app.user_id` inside its transaction, and every owner table has a policy on `owner_id`. With no user set, queries return nothing. `tests/rls.test.ts` proves this against a real database.
- **No hard deletes.** `amber_app` has no `DELETE` on owner tables; deletes are soft (`deleted_at`).
- **One account.** Sign-up is refused for any email except `ALLOWED_EMAIL`, and magic links are only sent to it.
- **Originals are never modified.** Media views use signed URLs that expire in 10 minutes.

## Local development

Needs Node 22, pnpm, Postgres 16, and any S3-compatible store (MinIO, or `moto_server`).

```bash
pnpm install
cp .env.example .env.local          # fill in; JOBS_MODE=inline, local S3 endpoint
pnpm db:migrate                     # as DATABASE_URL_OWNER
APP_DB_PASSWORD=... pnpm db:app-role   # prints the DATABASE_URL to use
pnpm dev
```

Sign in at `/sign-in`; with no `RESEND_API_KEY` the magic link prints in the terminal. Then add a passkey and a device token in Settings.

Tests: `pnpm test`. The RLS test runs when `TEST_DATABASE_URL_OWNER` and `TEST_DATABASE_URL` point at a migrated database; the HEIC test runs when `AMBER_HEIC_FIXTURE` points at an iPhone photo.

## First deploy (one time)

1. **Neon** (Vercel Marketplace > Neon, one project). Copy the owner connection string as `DATABASE_URL_OWNER`. Run `pnpm db:migrate`, then `APP_DB_PASSWORD=<long random> pnpm db:app-role` and use the printed URL as `DATABASE_URL` (pooled host is fine). Repeat `db:app-role` on any new Neon branch.
2. **R2.** Create bucket `amber-media` (no public access). Create an S3 API token scoped to it. Add a CORS rule so the browser can PUT directly:
   ```json
   [{ "AllowedOrigins": ["https://amber.shapyro.com", "http://localhost:3000"],
      "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```
3. **Trigger.dev.** Create project `amber`, set `TRIGGER_PROJECT_REF` and `TRIGGER_SECRET_KEY`, add the database, R2, and Mapbox variables to the Trigger.dev environment too (the job reads them), then `pnpm trigger:deploy`.
4. **Resend.** Verify `shapyro.com` (or a subdomain) and set `RESEND_API_KEY` and `EMAIL_FROM`.
5. **Vercel.** Import the repo, set every variable from `.env.example`, add the domain `amber.shapyro.com`, deploy.
6. Sign in, add a passkey, create a device token, and build the Shortcut from [`shortcut/README.md`](shortcut/README.md).
