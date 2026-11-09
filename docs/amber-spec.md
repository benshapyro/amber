# Amber — Product Spec v2.2

Interview completed 2026-09-27. Supersedes v1 (2026-09-18), v2 (2026-09-21), and v2.1 (2026-09-22). Written for a reader with no context and no engineering background. Technical terms are explained the first time they appear; there is a glossary at the end.

What changed from v1: the phone capture path moved from the web app to an iOS Shortcut (v1's assumption was wrong, see section 5); an agent API and hosted MCP server were added (section 10); the name is Amber; eight over-built items were trimmed (section 13); six gaps from the cold review were decided (section 14). Stack corrections in section 11. v2.1 adds files, links and embeds as media kinds, manual-only people tags, view-only sharing with place names only, and a v2 tier for viewer reactions and comments. v2.2 closes the build-time items: templates, default models, geocoding, the prompt bank, MCP tool names, Shortcut upload mechanics, repo and setup. Only the page-flip approach is left to the prototype.

## 1. What this is

Amber is a private website where its owner captures moments (photos, short videos, voice memos, a line of text), an AI drafts the words, and the result reads like a photo album you turn the pages of. It captures what the owner already tells the people around them, once, and sends it onward from there. Agents (Claude, Codex, scripts) can read it and add drafts to it through an API.

The core loop is capture, not writing. If capture is not easier than sending an iMessage, the product has failed.

## 2. Goals and non-goals

Goals

- Capture a moment from the phone in fewer taps than a text message, with the original file, time, and location intact.
- Never lose the originals. This is the archive.
- AI drafts captions, moment text, titles, and weekly/monthly notes in the owner's voice. The owner approves everything; nothing becomes final without them.
- Read it as a book: turn pages, chapters by month, jump by timeline.
- Share a moment, a page, or a tag with a link.
- Agents can read everything and write drafts through the same API the app uses.
- Design so a second user could be added later without a rewrite.

Non-goals for v1: public blog; free-form page layout; camera-roll backfill; Instagram import; multi-user invites; video transcoding; offline capture queue. See the scope log in section 13.

## 3. Who uses it

One owner per install, plus agents acting with keys the owner issues. Anyone can run their own copy; each copy is private to its owner. Private by default. Anyone with a share link can view the shared item, nothing else.

Multi-user hedge: every table has an `owner_id` (which user owns this row), authentication supports many users, and row-level security (RLS: database rules that hide other users' rows even if the app has a bug) is enforced from day one. Only one account is allowed to sign in. No invite flow.

## 4. Data model

Plain-English definitions. The moment is the atomic unit; everything else is a view of moments or a container for them.

**Moment** — one memory.
- `title` (optional; AI can draft)
- `body` (optional; Markdown, which is plain text with light formatting marks like `**bold**`)
- `starts_on`, `ends_on` — a date span. Auto-set from the earliest and latest media capture times, each in the local time zone where it was taken (a 1am photo in Athens is that Athens day). A text-only moment defaults to today. Ben can override both dates. A single day is start = end.
- `kind`: `moment` or `period_note`
- `period` (period notes only): `week` or `month`
- `status`: `draft` or `kept`
- tags, media (zero or more)
- Rule: a moment must have at least one media item or a non-empty body.

A daily note is a moment spanning one day with no media. A weekly note is `kind = period_note, period = week`, spanning that week. Same table. There is no stored "day" object; a day view is a query for everything touching that date.

**Media** — a photo, video, audio file, other file, or link.
- `kind`: `photo`, `video`, `audio`, `file` (PDF or anything else, stored as-is and downloadable), `link` (a URL; Amber fetches its title, description, and preview image once, and stores them)
- Embeds: a link from an allowlisted provider (YouTube, Spotify, SoundCloud, Apple Music, Vimeo; extendable in config) renders as an inline player using the provider's standard embed (oEmbed). Any other link renders as a card. Suno has no embed standard, so a Suno track is stored as an audio file. If an embed breaks, the card is the fallback.
- `captured_at` from EXIF (the metadata a camera writes into the file: time, GPS, camera), with time zone offset. Falls back to upload time.
- `lat`, `lng`, `place_name` (reverse-geocoded: GPS coordinates turned into a place name, via Mapbox; the coordinate is sent with no identity attached and results are cached so each location is looked up once)
- `caption` (AI-drafted, owner-approved), `transcript` (audio only)
- `original_key` plus derived sizes for photos (thumbnail, page, full). Originals are never modified.
- `moment_id` (nullable). Media with no moment is in the **Inbox**.

**Tag** — a free-text label on a moment. One type in v1. People are tagged by name, by hand; the AI may propose a person tag from a note or transcript ("with Sam"). No face detection. A tag doubles as an album (all moments with that tag) and as a share target. A `type` column can be added later without touching existing tags.

**Page** — one slot in the book. Presentation only, never data.
- `position` in the book; `template` (one of three, section 8); ordered list of moments on the page (default: one)
- Reserved per-block `layout` field (empty in v1; for future free-form positioning)
- A moment is auto-placed on its own page when kept. A moment can be on one page only. Removing a page returns its moments to their own pages in date order.
- Export and integrations read moments only and never see pages.

**Share link** — an unguessable URL to one moment, one page, or one tag. Revocable. No expiry. Tag links are live: new kept moments with that tag appear.

**Voice profile** — per user. A text block describing how drafts should sound, seeded from the owner's own writing (default style: short paragraphs, fragments, plain words, no em dashes). Editable in settings.

**Activity log** — one row per action: who (the owner, or which API key) did what (created draft, kept, revoked link, uploaded) to which record, when. Needed once agents write.

**Provenance** — every moment and media row carries `created_at`, `updated_at`, `source` (`web`, `shortcut`, `api:<key name>`, `import`), and for AI drafts the model and prompt version used. Every ID is a stable UUID (a long random identifier that never changes). This makes a future my-brain integration a mapping exercise.

## 5. Capture

**Why the Shortcut is primary.** Since iOS 17, Safari's file picker converts HEIC photos to JPEG and strips location by default, and a website cannot override it. Photos taken through a web page's camera button have no EXIF at all. So a web capture screen cannot deliver originals, GPS, or reliable capture time. An iOS Shortcut can. v1 assumed the opposite; the cold review caught it.

**Phone: the Amber Shortcut.** Appears in the share sheet of Photos, Google Photos, Camera, or any app.
1. Select photos/videos, tap Share, tap Amber.
2. The Shortcut asks once: record a voice memo, type a line, or skip.
3. It posts the original files plus the note to the API with a per-device token. Done.
Media with a note becomes a draft moment. Media alone goes to the Inbox. If there is no signal, the Shortcut fails visibly and the owner runs it again later; the Photos app is the buffer, nothing is lost.

**Desktop and text: the web app.** Drag-and-drop upload (originals intact on desktop), a text box for a line or a full note, a voice-memo button. This is also where editing happens.

**Share out.** From any moment, a Share button hands the photos and note to the phone's share sheet (iMessage, WhatsApp, anything) using the web share API. Photos are prefetched so the share fires on the tap.

**Inbox.** Unattached media, newest first. AI clustering suggests groups (by time gaps and GPS) and offers "make a moment" per group. The owner can also select by hand.

**Google Photos.** Covered by the Shortcut (it appears in Google Photos' share sheet). No Google API integration.

## 6. AI jobs

All jobs produce drafts. A draft is visible, labelled, and never becomes `kept` without the owner's action. Hard rule in every prompt: never invent a fact that is not in the owner's notes, transcript, approved captions, EXIF time/place, or the image itself.

| Job | Input | Output | Trigger |
|---|---|---|---|
| Photo caption | image + EXIF time/place | one-line caption | on upload |
| Transcription | audio file | transcript | on upload |
| Moment draft | The owner's line or transcript + captions + time/place + voice profile | title + body | on create, or on demand |
| Inbox clustering | inbox media times + GPS | suggested groups | when inbox changes. **Not an LLM job**: a gap of more than 3 hours or more than 2 km between consecutive items starts a new group. Deterministic and free |
| Period note draft | all kept moments in the span + captions + voice profile | weekly or monthly note | on schedule (section 7) |
| Writer's-block prompts | recent moments, calendar gaps, uncaptioned photos | 3 personalised questions | on demand, plus the static bank below |

**Model routing.** One provider abstraction (Vercel AI SDK). OpenRouter is the gateway for everything including transcription (OpenRouter added an audio transcription endpoint in May 2026). A config file maps each job to a model; changing a model is a config edit. Job configs pin OpenRouter to providers with no-training, no-logging data policies, because these are personal photos of the owner and the people in their life.

**Default models** (starting point; names current as of June 2026, verify exact OpenRouter IDs when building):

| Job | Model | Why |
|---|---|---|
| Photo caption | Claude Sonnet (vision) | Captions feed every draft, so their quality compounds |
| Moment draft, titles | Claude Sonnet | Fast, good at voice matching |
| Period note draft | Claude Opus | Highest-value writing, runs once a week |
| Writer's-block prompts | Claude Sonnet | Cheap, on demand |
| Transcription | Whisper large v3 (via OpenRouter audio) | Standard; swap if a better one appears |
| Inbox clustering | none | Arithmetic |

Claude-first was chosen over cheapest-per-job because one person's photo volume makes the cost difference a few dollars a month and one voice family is easier to tune.

**Static prompt bank** (the ten; the LLM personalises beyond these):
1. What did today smell like?
2. Who did you talk to, and what did they say that you want to remember?
3. What was the best thing you ate?
4. What almost went wrong?
5. What would you tell yourself a week ago about today?
6. Pick one photo. What happened thirty seconds before it?
7. What did you do today that you never do at home?
8. What is one thing you are tired of, and one thing you are not?
9. Who would you have wanted here?
10. What do you want to remember about this that a photo cannot show?

## 7. Rituals

Weekly and monthly in v1. Quarterly and annual after a few monthlies exist.

- Sunday evening in the owner's current time zone (the offset of their most recent upload; manual override in settings): draft the week's note from that week's kept moments. Email a nudge with the draft and a link. The owner edits and keeps, or discards, from their phone.
- First of the month: same for the month.
- A period with no kept moments gets no draft; the email says so and offers a writer's-block prompt.

## 8. The book

- Shows kept moments only. Drafts and the Inbox are a separate workbench. The book never looks half-done.
- Each page is a two-page spread on desktop and landscape, a single page on phone. One page-turn animation, implemented once.
- Default: one moment per page. A page can hold more via an "add to page" menu (no drag). Add a layout when one is missing.
- **Three templates in v1:**
  - **Full-bleed.** One photo fills the page edge to edge. Title and body overlay the bottom third on phone; on a desktop spread, the photo takes the left page and the text the right. Default for a moment with one photo.
  - **Grid.** Two to six photos tiled (2, 3, 4, 6 layouts; more than six paginates), text alongside on desktop, below on phone. Default for a moment with several photos and for multi-moment pages.
  - **Text.** The note is the page. Large type, generous margins. Default for text-only moments and all period notes.
  - The default template is picked automatically from media count; The owner can switch per page.
- Chapters: a divider page per month. A moment lives in the chapter of its start month. Period notes for a month sit at the end of that chapter.
- Navigation: a timeline strip (jump to any date), a tag drawer, full-text search over titles, bodies, captions, transcripts.
- **Quiet mode:** a setting that replaces the page turn with an instant cut. Also honours the phone's reduce-motion setting. The page turn is the one deliberate exception to the design's no-decorative-motion rule and must be switchable off.
- **Editor:** one responsive editor on phone and desktop. A plain text box with Markdown and a preview toggle, a voice-memo button, keep/discard. Not a rich editor.

**Look:** the default theme (obsidian, extreme whitespace, amber as punctuation), changeable with a few colour tokens. Photos are the colour. Chrome is near-invisible.

**The page-turn animation is the main design uncertainty.** Slice 1 prototypes it with real photos before anything else exists, comparing a hand-built CSS 3D transform against an off-the-shelf page-flip library, and picks on feel.

## 9. Sharing

- Links for a moment, a page, or a tag. Unguessable, revocable from a list in settings. Tag links are live.
- Shared view is read-only: no navigation into the rest of the book, no inbox, no drafts, no reactions or comments. Only kept content.
- Shared views show place names, never raw coordinates.
- Media on shared views is served through short-lived signed URLs (links that expire in minutes and are re-issued while the share link is valid), so a saved image URL stops working after revocation.

## 10. Agent API and MCP

**API-first.** Every screen in the web app calls the same REST API that agents call, so the API can never lag the UI. The OpenAPI spec (a machine-readable description of every endpoint) is generated from the code.

**Hosted MCP.** A remote MCP server at `<your domain>/mcp` (for example `amber.example.com/mcp`) wraps the API. MCP is the protocol Claude, Codex, and other agents use to call tools. Any MCP client connects with a key; no local install. The Shortcut, n8n, and scripts use the REST API directly.

**Permissions.** Keys carry scopes (named permissions):
- `read`: list and search moments, media, tags, pages; fetch derived images and transcripts.
- `draft`: upload media to the inbox; create and edit draft moments; add tags; suggest page groupings; request AI jobs.
- `keep` and `share` (not issued in v1): mark kept; create share links. Reserved so a specific agent can be upgraded later without an API change.
Default key = `read` + `draft`. Only the owner, signed in, can keep or share. Every API write lands in the activity log with the key's name.

**Resources exposed.** REST endpoints and MCP tool names map one-to-one. Tool names are `resource_verb`:

| REST | MCP tool | Scope |
|---|---|---|
| `GET /moments`, `GET /moments/search` | `moments_list`, `moments_search` | read |
| `GET /moments/{id}` | `moments_get` | read |
| `POST /moments` (draft only), `PATCH /moments/{id}` (drafts only) | `moments_create_draft`, `moments_update_draft` | draft |
| `GET /inbox` | `inbox_list` | read |
| `POST /media/upload-url`, `POST /media/{id}/confirm` | `media_upload` (wraps both) | draft |
| `GET /media/{id}` | `media_get` | read |
| `GET /tags`, `POST /moments/{id}/tags` | `tags_list`, `tags_add` | read / draft |
| `GET /pages`, `POST /pages/suggest` | `pages_list`, `pages_suggest` | read / draft |
| `GET /period-notes` | `period_notes_list` | read |
| `POST /jobs/caption`, `/jobs/draft`, `/jobs/prompts` | `jobs_caption`, `jobs_draft`, `jobs_prompts` | draft |
| `GET /activity` | `activity_list` | read |
| `POST /export` | `export_create` | read |
| `POST /moments/{id}/keep`, `POST /shares` | `moments_keep`, `shares_create` | keep / share (not issued in v1) |

**Upload mechanics** (Shortcut, web, and agents all use the same two calls): 1) `POST /media/upload-url` with filename, size, and type returns a signed R2 URL; 2) the client PUTs the file straight to R2; 3) `POST /media/{id}/confirm` with an optional note and Shortcut device name tells Amber the file landed and starts the background job (EXIF, HEIC decode, derived sizes, caption). Nothing large passes through Vercel.

## 11. Stack and infrastructure

Chosen for what Amber needs (media-heavy private archive with video, background jobs, agent API, one user with a multi-user hedge), not for familiarity.

| Layer | Choice | Why |
|---|---|---|
| App | Next.js on Vercel | Least-friction host for this shape; Hobby plan permits personal non-commercial use |
| Database | Neon Postgres via Vercel Marketplace; Drizzle ORM | Scales to zero for one user; branch per preview. Vercel Postgres became Neon in Dec 2024 |
| RLS | App connects as a restricted database role and sets the user per request | Without this, Neon's table owner bypasses RLS and the hedge is a no-op |
| Auth | Better Auth: passkey + email magic link, allowlisted to one email; API keys with scopes | Small, multi-user-ready, no platform lock-in |
| Media storage | Cloudflare R2 | Zero egress fees: an album re-serves the same media constantly. Direct-to-R2 signed uploads bypass Vercel's request-size limit for video. ~$1.50 per 100 GB/month |
| Derived images | Sharp in a background job; HEIC decoded via libheif (Sharp's prebuilt binary cannot decode HEIC, so the job image needs a custom build) | Originals untouched |
| Jobs and cron | Trigger.dev (Hobby tier, ~$10/month) | Long-running tasks without timeouts, scheduled runs, retries |
| Email | Resend | Weekly/monthly nudges |
| LLM | OpenRouter via Vercel AI SDK, including transcription | Model-agnostic per job |
| Backup | A home computer **pulls** nightly: rclone sync from R2 + a database dump, on a schedule (launchd on a Mac) | Cloud pushing to a home machine would mean exposing it |
| Domain | The owner's own domain (for example `amber.example.com`); `/mcp` on it for MCP | Separate from any public site the owner runs |
| Repo | One open-source (MIT) repo, single Next.js app; Trigger.dev tasks in `/trigger`; Shortcut exported as `.shortcut` in `/shortcut` | One repo, one deploy |
| Geocoding | Mapbox reverse geocoding, cached per rounded coordinate | Free at this volume, good place names |

Why not Supabase: its advantage is the bundle, and media belongs on R2 anyway, so the bundle shrinks to auth. Why not all-Cloudflare: Next.js is second-class there and D1 is SQLite.

**Security defaults:** least privilege on every key; the Shortcut token can only create inbox items and draft moments; all deletes are soft (hidden, erased after 30 days) so a photo can be recovered; activity log on every write.

**Video:** stored and played as-is. iPhone HEVC plays in Safari and in Chrome on Mac/Windows with hardware decode; a player note covers the rest. Transcoding is v1.1.

Estimated cost: $15–40/month (Trigger.dev $10, R2 a few dollars, LLM usage the rest).

## 12. Build order (vertical slices)

Each slice is usable on its own.

1. **Page-turn prototype.** Static book, ten real photos, both animation approaches, phone and desktop. Decide. No backend.
2. **Capture to inbox.** Auth, schema with RLS role, R2 upload, EXIF, HEIC decode, derived sizes, Inbox view, the Shortcut, REST API for upload. The owner starts saving photos.
3. **Backup.** Home-computer pull job. Before any more photos accumulate only in R2.
4. **Moments and the book.** Create a moment from inbox or web, editor, one-moment-per-page book with month chapters, timeline strip, quiet mode.
5. **AI drafts.** Captions, transcription, moment drafts, deterministic clustering, voice profile, prompt bank.
6. **Agent API.** Full REST surface with OpenAPI, scoped keys, activity log, hosted MCP.
7. **Rituals and sharing.** Weekly/monthly drafts, email nudges, share links.
8. **Pages, tags, search, export.** Multi-moment pages, three templates, tags, tag albums, search, Markdown + media zip.

## 13. Scope log

**In v1:** sections 4–12 except the items below.

**Trimmed from v1 after review** (with the plain-English reason):
- Drag-to-page → "add to page" menu. Drag is fiddly on phones.
- Five templates → three. Add when one is missing.
- Three tag types → one. A type column can be added later.
- 50-prompt bank → 10 (listed in section 6). The LLM generates the rest.
- Quarter/year period values → removed until those notes are built.

**Kept after review:** activity log (needed once agents write), 30-day soft delete (losing a photo is the one irreversible mistake), reserved layout field (one column), prompt-version provenance (know which drafts came from old instructions).

**v1.1:** Instagram data-export importer; quarterly and annual notes; video transcoding to H.264; Google Photos Picker API if the Shortcut annoys; `keep`/`share` scopes for chosen agents; offline capture queue if visible failures prove annoying.

**v2:** reactions and comments from share-link viewers (family replies are themselves memorabilia; build once the core loop is proven).

**Later / undecided:** free-form page layout; face detection for people tags; live sync into a personal knowledge base (export format is the contract); second user, invites, tenancy; public entries; "on this day" resurfacing; camera-roll backfill; native iOS app if the Shortcut proves limiting.

## 14. Decision log

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Audience | private; private + share links; public; per-entry | Private + share links | Candid drafts, small auth |
| Home | new app on subdomain; inside an existing site repo; extend an existing app | New app on its own subdomain | Different privacy posture from a public site |
| Multi-user | hedge; product intent; family accounts | Hedge, with a real RLS role | Owner column + enforced RLS, no invites |
| Other personal tools | self-contained + export; live feed; replace an existing tool; none | Self-contained + export, stable IDs | Integration later is a mapping |
| Unit | day + moments; day only; moment; photo | Moment with a date span | Absorbs multi-day spans and sparse writing |
| Inbox | require moment on upload; allow unattached | Unattached allowed | Keeps capture quick |
| Page | moment per page; period per page; day per page | Moment per page, combinable | Pages are presentation only |
| Layout | templated; templated + reserved field; free-form | Templated, reserved field | Free-form is a separate product |
| Rituals | weekly + monthly; all five; ad hoc | Weekly + monthly, email | Prove the habit first |
| AI jobs | captions; drafts; clustering; period drafts; prompts | All, plus transcription | One pipeline |
| Provider | Claude API; local; API text only | OpenRouter, model per job, no-training providers | Model-agnostic was the ask |
| Media | photos; video as-is; video transcoded; audio | Photos + video as-is + audio with transcription | Voice memo is the lowest-friction capture |
| Grouping | tags; time only; explicit albums | Tags, one type | Tag = album = share target |
| Surfaces | both; desktop-first; phone-first | Both, one animation, quiet mode | Capture on phone, read anywhere |
| Channels in use | iMessage; WhatsApp; Instagram; Telegram | Share out via the phone's share sheet | Share sheet is the only iMessage route and covers the rest |
| Direction | journal-first; channel-first; both | Journal-first, share out | Only version that lowers friction |
| **Phone capture (v2)** | Shortcut primary; web primary accepting loss; native app | Shortcut primary | iOS web upload strips HEIC originals and GPS; Shortcut keeps them and is fewer taps |
| Stack | Next.js + Supabase; Next.js + Neon + R2; all-Cloudflare | Next.js + Neon + R2 + Trigger.dev | Egress, jobs, hedge; not familiarity |
| Originals | keep; web sizes only | Keep + derived | This is the archive |
| Voice | owner's profile; neutral; verbatim | Voice profile, never invents | Less editing per draft |
| Backfill | start now; Instagram v1; full backfill | Start now, Instagram v1.1 | The next trip is chapter one |
| **Trim (v2)** | keep all; trim 5–8; other | Keep log, soft delete, layout field, provenance; trim drag, templates, tag types, prompt bank, quarter/year | Agent API makes log and provenance worth having |
| **Agent powers (v2)** | read + draft; full write scoped; read only | Read + draft; keep/share scopes reserved | "The owner approves everything" survives |
| **API shape (v2)** | API-first + hosted MCP; MCP only; REST then MCP | API-first + hosted MCP | App and agents share one API; Shortcut needs REST anyway |
| **Name (v2)** | Kept; Ephemera; Vellum; Almanac; Amber; Ember; Bound; Trove | Amber | Preserves what falls into it; also the accent colour |
| **Dates (v2)** | auto from media + override; manual; single day | Auto + override; chapter by start month | Local time zone where taken |
| **Drafts in book (v2)** | kept only; drafts marked | Kept only | Book is the reward; workbench holds AI output |
| **Tag links (v2)** | live; snapshot | Live | One link per trip |
| **Offline (v2)** | no queue; queue in Shortcut; queue in web | No queue | Photos app is the buffer |
| **Phone editing (v2)** | full simple editor; review-only | Full simple editor | Sunday email is read on the phone |
| **Ritual time zone (v2)** | last upload offset; fixed setting | Last upload offset, override in settings | Cron has no other way to know where the owner is |
| **Backup direction (v2)** | cloud pushes to home machine; home machine pulls | Home machine pulls | No exposed home machine |
| **Memorabilia (v2)** | images only; files + links; files + links + embeds | Files + links + embeds via oEmbed allowlist, card fallback | Boarding passes, songs, articles are memories too |
| **People (v2)** | manual person tags; face suggestions | Manual; AI proposes from notes | No biometric data of friends who didn't opt in |
| **Viewers (v2)** | view only; reactions; comments | View only; reactions and comments are v2 | Prove the core loop first |
| **Location on shares (v2)** | show coordinates; place names only; nothing | Place names only | Enough context, no precise location leak |
| **Templates (v2.2)** | Full-bleed/Grid/Text; Full-bleed/Grid/Spread; other | Full-bleed, Grid, Text; auto-picked by media count | Text is required for period notes; Spread is a Full-bleed variant for later |
| **Default models (v2.2)** | Claude-first; cheapest per job; one model | Claude-first: Sonnet for captions and drafts, Opus for period notes, Whisper v3 for audio | Caption quality compounds; cost difference is a few dollars |
| **Clustering (v2.2)** | LLM; deterministic | Deterministic: 3-hour or 2 km gap starts a group | Arithmetic, free, predictable |
| **Geocoding (v2.2)** | Mapbox; Nominatim; Google | Mapbox, cached | Free at this volume, good names; no provider guarantees no-retention, so send only coordinates |
| **Prompt bank (v2.2)** | write now; write during build | Written now, ten prompts in section 6 | Nothing to guess at build time |
| **MCP tool names (v2.2)** | derive from REST; invent | `resource_verb`, one per endpoint | Nothing to guess at build time |
| **Upload mechanics (v2.2)** | through Vercel; direct to R2 with confirm | Signed URL, direct PUT, confirm call | Vercel request-size limit; one path for Shortcut, web, agents |
| **Repo (v2.2)** | one repo; app + jobs split | One private repo, Trigger tasks and Shortcut inside | One deploy |
| **Page-flip approach (slice 1, 2026-10-29)** | hand-built CSS 3D; StPageFlip library | Hand-built CSS 3D | Flat swing on the spine fits the brand's restraint better than a paper curl; no dependency on a library unmaintained since 2021; quiet mode lives in the same code. |
| **HEIC decoding (slice 2, 2026-10-29)** | custom Sharp build with libheif; libheif compiled to WebAssembly (`heic-decode`) feeding Sharp | WebAssembly libheif | No custom native build to maintain on Trigger.dev; rotation is applied on decode; colour profile is lost, so HEIC copies are tagged Display P3 (what iPhones shoot) |
| **Local day without metadata (slice 2, 2026-11-03)** | UTC; phone's time zone at upload | Phone's time zone: clients send `sent_at` with their offset | A voice memo on a US evening was landing on tomorrow's date |
| **Open source (2026-11-04)** | private repo; open source, MIT; open source, AGPL-3.0 | Open source under MIT, self-hostable; each owner's data stays in their own Neon and R2, never in the repo | Others can clone and run their own Amber; no hosted product to protect |

## 15. Open items

None. The page-flip approach was decided in slice 1 (2026-10-29): hand-built CSS 3D. Everything in this spec is decided.

## Glossary

- **API** — a way for programs to talk to Amber without the web page. REST is the common style; OpenAPI is its written description.
- **MCP** — the protocol AI agents use to call tools. A hosted MCP server means the agent connects over the internet with a key.
- **EXIF** — metadata a camera writes inside a photo: time, GPS, camera model.
- **HEIC / HEVC** — Apple's photo and video formats. Smaller files, worse browser support.
- **RLS** — row-level security: database rules that hide rows a user doesn't own, even if the app has a bug.
- **Signed URL / signed upload** — a link that carries its own temporary permission, so a file can be fetched or uploaded without the app server in the middle.
- **Soft delete** — hide and mark for erasure, erase later. Recoverable.
- **Scope** — a named permission on an API key.
- **Vertical slice** — a thin version of the whole product, usable end to end, rather than one finished layer.
- **Scales to zero** — the database costs nothing while idle.
- **Egress** — data leaving the storage provider; the fee most providers charge per download.
