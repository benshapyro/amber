import type { MediaView } from "@/lib/capture";

function time(m: MediaView) {
  if (!m.captured_at) return "";
  const local = new Date(new Date(m.captured_at).getTime() + (m.captured_tz_offset ?? 0) * 60000);
  return local.toISOString().slice(11, 16);
}

export function MediaTile({ item: m }: { item: MediaView }) {
  const label = [m.filename, time(m), m.place_name].filter(Boolean).join(" · ");
  const frame = "relative aspect-square overflow-hidden bg-accent";

  if (m.status === "failed") {
    return (
      <div className={`${frame} flex items-center justify-center p-2 text-center text-xs text-destructive`} title={m.error ?? ""}>
        Could not process {m.filename}
      </div>
    );
  }
  if (m.kind === "photo" && !m.urls.thumb) {
    return (
      <div className={`${frame} flex items-center justify-center text-xs text-muted-foreground motion-safe:animate-pulse`}>
        Processing
      </div>
    );
  }
  if (m.kind === "photo") {
    return (
      <a href={m.urls.full ?? m.urls.page} target="_blank" rel="noreferrer" className={frame} title={label}>
        {/* Signed R2 URLs expire in minutes, so next/image caching does not apply. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.urls.thumb} alt={label} loading="lazy" className="h-full w-full object-cover" />
      </a>
    );
  }
  if (m.kind === "video" && m.urls.original) {
    return (
      <div className={frame} title={label}>
        <video
          src={`${m.urls.original}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          controls
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <a
      href={m.urls.original}
      target="_blank"
      rel="noreferrer"
      className={`${frame} flex flex-col items-center justify-center gap-1 p-2 text-center`}
      title={label}
    >
      <span className="text-xs tracking-[0.3em] text-secondary uppercase">{m.kind === "audio" ? "Audio" : "File"}</span>
      <span className="line-clamp-2 text-xs break-all text-muted-foreground">{m.filename}</span>
    </a>
  );
}
