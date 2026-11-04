// Who is making a request. The web app (the owner, signed in) and API keys
// (the Shortcut, agents) go through the same functions with one of these.
export type Scope = "read" | "draft" | "keep" | "share";

export type Caller = {
  userId: string;
  // Shown in the activity log: the owner's name or the API key's name.
  actor: string;
  apiKeyId: string | null;
  // Provenance written on every row this caller creates.
  source: string;
  scopes: ReadonlySet<Scope>;
};
