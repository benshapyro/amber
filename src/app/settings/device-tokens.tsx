"use client";

import { useState, useTransition } from "react";
import { createDeviceToken, revokeDeviceToken } from "./actions";

type Device = { id: string; name: string; start: string | null; createdAt: string; lastRequest: string | null };

export function DeviceTokens({ devices }: { devices: Device[] }) {
  const [name, setName] = useState("iPhone");
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      {devices.length > 0 && (
        <ul className="divide-y divide-border border-y border-border text-sm">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 py-3">
              <span>
                {d.name} <span className="text-muted-foreground">{d.start}…</span>
                <span className="block text-xs text-muted-foreground">
                  Created {d.createdAt.slice(0, 10)}
                  {d.lastRequest ? ` · last used ${d.lastRequest.slice(0, 10)}` : " · not used yet"}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Revoke the token for ${d.name}? Its Shortcut will stop working.`)) {
                    startTransition(() => revokeDeviceToken(d.id));
                  }
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {created ? (
        <div className="rounded-lg border border-primary/40 bg-card p-4 text-sm">
          <p>
            Token for <strong>{created.name}</strong>. Paste it into the Shortcut now: Amber only shows it once.
          </p>
          <code className="mt-3 block rounded bg-accent p-3 text-xs break-all select-all">{created.key}</code>
          <div className="mt-3 flex gap-4">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(created.key);
                setCopied(true);
              }}
              className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={() => setCreated(null)} className="text-muted-foreground">
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setCopied(false);
              setCreated(await createDeviceToken(name));
            });
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            aria-label="Device name"
            className="w-48 rounded border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-border px-4 py-2 text-sm transition-colors hover:border-primary disabled:opacity-50"
          >
            New device token
          </button>
        </form>
      )}
    </div>
  );
}
