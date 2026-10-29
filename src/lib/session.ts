import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import type { Caller } from "./caller";

// For pages: the signed-in owner as a Caller, or off to sign-in.
export async function requireOwner(): Promise<Caller> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return {
    userId: session.user.id,
    actor: session.user.name || "Ben",
    apiKeyId: null,
    source: "web",
    scopes: new Set(["read", "draft", "keep", "share"]),
  };
}
