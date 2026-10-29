import { Suspense } from "react";
import { Header } from "@/components/header";
import { listDrafts, listInbox, type MediaView } from "@/lib/capture";
import { localDay } from "@/lib/metadata/capture-time";
import { requireOwner } from "@/lib/session";
import { AutoRefresh } from "./_inbox/auto-refresh";
import { MediaTile } from "./_inbox/media-tile";
import { UploadZone } from "./_inbox/upload-zone";

export default function InboxPage() {
  return (
    <>
      <Header current="inbox" />
      <main className="mx-auto max-w-6xl px-5 pb-24 md:px-8">
        <Suspense fallback={<p className="py-16 text-sm text-muted-foreground">Opening the inbox…</p>}>
          <Inbox />
        </Suspense>
      </main>
    </>
  );
}

function dayKey(m: MediaView) {
  if (!m.captured_at) return "undated";
  return localDay(new Date(m.captured_at), m.captured_tz_offset);
}

function dayLabel(key: string) {
  if (key === "undated") return "No date";
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function groupByDay(items: MediaView[]) {
  const groups = new Map<string, MediaView[]>();
  for (const m of items) {
    const key = dayKey(m);
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()];
}

async function Inbox() {
  const caller = await requireOwner();
  const [items, drafts] = await Promise.all([listInbox(caller), listDrafts(caller)]);
  const busy = [...items, ...drafts.flatMap((d) => d.media)].some(
    (m) => m.status === "uploaded" || m.status === "processing",
  );

  return (
    <>
      <AutoRefresh active={busy} />
      <UploadZone />

      {drafts.length > 0 && (
        <section className="mt-14">
          <SectionTitle eyebrow="Drafts" count={drafts.length} />
          <ul className="mt-6 space-y-10">
            {drafts.map((d) => (
              <li key={d.id} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {d.starts_on ? dayLabel(d.starts_on) : "Today"} · from {d.source}
                  </p>
                  {d.body ? (
                    <p className="mt-2 font-serif text-2xl leading-snug whitespace-pre-line">{d.body}</p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground italic">Voice memo, transcript coming later.</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                  {d.media.map((m) => (
                    <MediaTile key={m.id} item={m} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-14">
        <SectionTitle eyebrow="Inbox" count={items.length} />
        {items.length === 0 ? (
          <p className="mt-6 max-w-md text-muted-foreground">
            Nothing waiting. Share photos to Amber from your phone, or drop files above.
          </p>
        ) : (
          groupByDay(items).map(([key, group]) => {
            const places = [...new Set(group.map((m) => m.place_name).filter(Boolean))];
            return (
              <div key={key} className="mt-10">
                <h3 className="font-serif text-xl">{dayLabel(key)}</h3>
                {places.length > 0 && <p className="mt-1 text-xs text-secondary">{places.join(" · ")}</p>}
                <div className="mt-4 grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6">
                  {group.map((m) => (
                    <MediaTile key={m.id} item={m} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}

function SectionTitle({ eyebrow, count }: { eyebrow: string; count: number }) {
  return (
    <div>
      <p className="text-xs tracking-[0.3em] text-secondary uppercase">
        {eyebrow} <span className="text-muted-foreground">· {count}</span>
      </p>
      <div className="stitch mt-3" />
    </div>
  );
}
