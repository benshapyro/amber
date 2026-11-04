import { auth } from "./auth";
import type { Caller, Scope } from "./caller";
import { HttpError } from "./errors";

const OWNER_SCOPES: ReadonlySet<Scope> = new Set(["read", "draft", "keep", "share"]);

function bearer(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim() || null;
  return headers.get("x-api-key");
}

function parseJson<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// Every REST route starts here. An API key (the Shortcut, an agent) gets
// exactly its scopes; Ben signed in on the web gets all of them.
export async function resolveCaller(headers: Headers): Promise<Caller> {
  const key = bearer(headers);
  if (key) {
    const result = await auth.api.verifyApiKey({ body: { key } });
    if (!result.valid || !result.key) throw new HttpError(401, "Invalid or revoked API key.");
    const k = result.key;
    const permissions = parseJson<Record<string, string[]>>(k.permissions) ?? {};
    const metadata = parseJson<{ kind?: string }>(k.metadata) ?? {};
    const name = k.name ?? "unnamed key";
    return {
      userId: k.referenceId,
      actor: name,
      apiKeyId: k.id,
      source: metadata.kind === "device" ? "shortcut" : `api:${name}`,
      scopes: new Set((permissions.amber ?? []) as Scope[]),
    };
  }

  const session = await auth.api.getSession({ headers });
  if (!session) throw new HttpError(401, "Sign in, or send an API key as a Bearer token.");
  return {
    userId: session.user.id,
    actor: session.user.name || "Ben",
    apiKeyId: null,
    source: "web",
    scopes: OWNER_SCOPES,
  };
}
