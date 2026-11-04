import { headers } from "next/headers";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { auth } from "@/lib/auth";
import { requireOwner } from "@/lib/session";
import { DeviceTokens } from "./device-tokens";
import { Passkeys, SignOut } from "./passkeys";

export default function SettingsPage() {
  return (
    <>
      <Header current="settings" />
      <main className="mx-auto max-w-3xl space-y-16 px-5 pb-24 md:px-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <Settings />
        </Suspense>
      </main>
    </>
  );
}

function parseMetadata(value: unknown): { kind?: string } {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return (value as { kind?: string }) ?? {};
}

async function Settings() {
  await requireOwner();
  const h = await headers();
  const [passkeys, keys] = await Promise.all([
    auth.api.listPasskeys({ headers: h }),
    auth.api.listApiKeys({ headers: h }),
  ]);
  const list = Array.isArray(keys) ? keys : keys.apiKeys;
  const devices = list
    .filter((k) => parseMetadata(k.metadata).kind === "device")
    .map((k) => ({
      id: k.id,
      name: k.name ?? "Device",
      start: k.start,
      createdAt: new Date(k.createdAt).toISOString(),
      lastRequest: k.lastRequest ? new Date(k.lastRequest).toISOString() : null,
    }));

  return (
    <>
      <Section eyebrow="Passkeys" lede="Sign in with Face ID or Touch ID instead of waiting for an email.">
        <Passkeys passkeys={passkeys.map((p) => ({ id: p.id, name: p.name ?? "Passkey", createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null }))} />
      </Section>
      <Section
        eyebrow="Devices"
        lede="Each phone running the Amber Shortcut gets its own token. A token can add to the Inbox and start drafts. It cannot read anything, and you can revoke it here."
      >
        <DeviceTokens devices={devices} />
      </Section>
      <Section eyebrow="Account">
        <SignOut />
      </Section>
    </>
  );
}

function Section({ eyebrow, lede, children }: { eyebrow: string; lede?: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-xs tracking-[0.3em] text-secondary uppercase">{eyebrow}</p>
      <div className="stitch mt-3" />
      {lede && <p className="mt-4 max-w-xl text-sm text-muted-foreground">{lede}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}
