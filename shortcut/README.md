# The Amber Shortcut

The phone's capture path (spec section 5). It shows up in the share sheet of Photos, Google Photos, Camera, Files, or any app, sends the original files with their time and location intact, and asks once for a note.

Apple only imports Shortcuts that were signed on an Apple device, so this cannot be generated from the repo. Build it once by hand with the steps below (about ten minutes), then export it from the Shortcuts app as `Amber.shortcut` into this folder so it is versioned.

## Before you start

In Amber, open **Settings > Devices**, name the device (for example "Ben's iPhone"), tap **New device token**, and copy the token. It is shown once. The token can only add to the Inbox and start drafts; if the phone is lost, revoke it there.

## Shortcut settings

- Name: **Amber**. Icon and colour: your choice (amber is on-brand).
- Details: turn on **Show in Share Sheet**.
- Share Sheet types: **Images, Media, Files**.
- If there is no input: **Ask For Photos** (so it also works from the home screen).

## Actions, in order

Variable names are in bold. "Text" means the Text action.

**Setup**

1. Text: `https://amber.shapyro.com` → Set Variable **Base**.
2. Text: paste the device token → Set Variable **Token**.
3. Get Device Details: Device Name → Set Variable **Device**.
4. Current Date → Format Date, Custom format `yyyyMMddHHmmssSSS` → Set Variable **Stamp**.
5. Random Number between 1000 and 9999 → Text: `Stamp-RandomNumber` (insert both variables with a hyphen between) → Set Variable **Capture**. Every file in this run sends it, so they all land on one draft moment.
6. Text: leave empty → Set Variable **Note**.

**The one question**

7. Set Variable **Files** to Shortcut Input.
8. Choose from Menu, prompt "Add a note?", options **Voice memo**, **Type a line**, **Skip**.
   - **Voice memo:** Record Audio (Audio Quality: Normal, Start Recording: On Tap, Finish Recording: On Tap). Then: Set Variable **Files** to Recorded Audio, and Add Shortcut Input to Variable **Files**. This puts the memo first, so the draft moment exists before the photos arrive. Amber treats an audio file with a capture id as the note.
   - **Type a line:** Ask for Input (Text, prompt "What happened?") → Set Variable **Note**.
   - **Skip:** nothing.
9. End Menu.

**Upload, for each file**

10. Repeat with Each item in **Files**, then inside the repeat:
   1. Get Name of Repeat Item → Set Variable **Name**. (A name without an extension is fine: Amber reads the file's first bytes to tell what it is.)
   2. Get Contents of URL
      - URL: `Base/api/media/upload-url`
      - Method: POST. Headers: `Authorization` = `Bearer Token`.
      - Request Body: JSON, `filename` (Text) = **Name**.
   3. Get Dictionary Value `upload_url` from Contents of URL → Set Variable **UploadURL**. Get Dictionary Value `media_id` → Set Variable **MediaID**. Get Dictionary Value `content_type` → Set Variable **Type**.
   4. Get Contents of URL
      - URL: **UploadURL**. Method: PUT.
      - Headers: `Content-Type` = **Type**.
      - Request Body: File, **Repeat Item**.
   5. Recommended fallback for files without metadata: Get Details of Images, Date Taken, from Repeat Item → Format Date, ISO 8601, include time → Set Variable **Taken**.
   6. Get Contents of URL
      - URL: `Base/api/media/MediaID/confirm`
      - Method: POST. Headers: `Authorization` = `Bearer Token`.
      - Request Body: JSON with `capture_id` = **Capture**, `note` = **Note**, `device` = **Device**, `captured_at` = **Taken**.
   7. Get Dictionary Value `error` from Contents of URL. If it has any value: Show Alert "Amber did not get Name: Dictionary Value", then Stop This Shortcut. No signal means the run stops visibly; the photos are still in Photos, so run it again later.
11. End Repeat.
12. Show Notification: "Sent to Amber".

## How it behaves

- Photos with a note (typed or voice) become one **draft moment**. Photos with no note go to the **Inbox**.
- Running a confirm twice is harmless, so retrying after a failure never duplicates anything.
- The original file goes to storage untouched. Amber reads its time, time zone, and GPS, and makes display copies without GPS in them.
- Voice memos are stored now; transcripts arrive with the AI slice.

## Check it worked

Share one photo with Skip: it appears in the Inbox within a few seconds with the right date. Share two photos with a typed line: they appear together under Drafts with the line above them.
