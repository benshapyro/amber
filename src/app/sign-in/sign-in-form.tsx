"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    if (error) {
      setState("error");
      setMessage(error.message ?? "That did not work. Try again.");
    } else {
      setState("sent");
    }
  }

  async function usePasskey() {
    setMessage("");
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setState("error");
      setMessage("No passkey for Amber on this device yet. Use the email link, then add one in Settings.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (state === "sent") {
    return (
      <p className="text-muted-foreground">
        If that address can sign in, a link is on its way. It works once and expires in five minutes.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={usePasskey}
        className="w-full rounded bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Sign in with passkey
      </button>
      <form onSubmit={sendLink} className="space-y-3">
        <label htmlFor="email" className="block text-xs tracking-[0.3em] text-secondary uppercase">
          Or email me a link
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email webauthn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-border bg-card px-3 py-3 text-base outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="w-full rounded border border-border px-4 py-3 text-sm transition-colors hover:border-primary disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Send link"}
        </button>
      </form>
      {message && <p className="text-sm text-destructive">{message}</p>}
    </div>
  );
}
