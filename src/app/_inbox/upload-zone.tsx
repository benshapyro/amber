"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Progress = { done: number; total: number; failed: string[] };

// Desktop capture: originals go straight to R2 with the same three calls
// the Shortcut and agents use. Nothing is resized or re-encoded here.
async function uploadOne(file: File) {
  const slotRes = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, size: file.size, content_type: file.type || undefined }),
  });
  if (!slotRes.ok) throw new Error((await slotRes.json()).error ?? "Could not start upload");
  const slot = (await slotRes.json()) as { media_id: string; upload_url: string; headers: Record<string, string> };

  const put = await fetch(slot.upload_url, { method: "PUT", headers: slot.headers, body: file });
  if (!put.ok) throw new Error("Upload to storage failed");

  const confirm = await fetch(`/api/media/${slot.media_id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device: "web" }),
  });
  if (!confirm.ok) throw new Error((await confirm.json()).error ?? "Could not confirm upload");
}

export function UploadZone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    const state: Progress = { done: 0, total: files.length, failed: [] };
    setProgress({ ...state });
    const queue = [...files];
    // Three at a time: fast on a good connection, gentle on a bad one.
    await Promise.all(
      Array.from({ length: Math.min(3, files.length) }, async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          try {
            await uploadOne(file);
          } catch {
            state.failed.push(file.name);
          }
          state.done += 1;
          setProgress({ ...state });
        }
      }),
    );
    router.refresh();
  }

  const busy = progress !== null && progress.done < progress.total;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        upload([...e.dataTransfer.files]);
      }}
      className={`hidden rounded-lg border border-dashed px-6 py-8 text-center text-sm transition-colors md:block ${
        dragging ? "border-primary text-foreground" : "border-border text-muted-foreground"
      }`}
    >
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          upload([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {busy ? (
        <p>
          Uploading {progress.done} of {progress.total}…
        </p>
      ) : (
        <p>
          Drop photos, videos, voice memos, or files here, or{" "}
          <button type="button" onClick={() => input.current?.click()} className="text-primary underline-offset-4 hover:underline">
            choose them
          </button>
          . Originals are kept as they are.
        </p>
      )}
      {progress && !busy && progress.failed.length > 0 && (
        <p className="mt-2 text-destructive">Did not upload: {progress.failed.join(", ")}</p>
      )}
    </div>
  );
}
