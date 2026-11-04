import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCaller } from "./api-auth";
import type { Caller } from "./caller";
import { HttpError } from "./errors";

type Handler<P> = (ctx: { req: Request; caller: Caller; params: P }) => Promise<unknown>;

// Wraps a REST handler: resolves the caller, turns thrown errors into JSON
// with the right status, and never leaks internals in a 500.
export function apiRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const caller = await resolveCaller(req.headers);
      const body = await handler({ req, caller, params: await ctx.params });
      return NextResponse.json(body ?? { ok: true });
    } catch (err) {
      // Let Next.js's own control-flow errors (prerender bail-out,
      // redirects) through instead of turning them into a 500.
      unstable_rethrow(err);
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request.", issues: err.issues }, { status: 400 });
      }
      console.error("[amber] unhandled API error", err);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Body must be JSON.");
  }
}
