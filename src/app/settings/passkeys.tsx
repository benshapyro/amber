"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Passkey = { id: string; name: string; createdAt: string | null };

export function Passkeys({ passkeys }: { passkeys: Passkey[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function add() {
    setError("");
    const result = await authClient.passkey.addPasskey({ name: navigator.platform || "This device" });
    if (result?.error) setError(result.error.message ?? "Could not add a passkey.");
    router.refresh();
  }

  async function remove(id: string) {
    await authClient.passkey.deletePasskey({ id });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {passkeys.length > 0 && (
        <ul className="divide-y divide-border border-y border-border text-sm">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3">
              <span>
                {p.name}
                {p.createdAt && <span className="ml-2 text-muted-foreground">added {p.createdAt.slice(0, 10)}</span>}
              </span>
              <button type="button" onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={add}
        className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Add a passkey on this device
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/sign-in");
      }}
      className="rounded border border-border px-4 py-2 text-sm transition-colors hover:border-primary"
    >
      Sign out
    </button>
  );
}
