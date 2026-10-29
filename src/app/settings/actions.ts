"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { auth } from "@/lib/auth";
import { requireOwner } from "@/lib/session";

// A device token is an API key with only the "draft" scope: it can put
// files in the Inbox and start draft moments, and cannot read anything.
export async function createDeviceToken(name: string) {
  const owner = await requireOwner();
  const clean = name.trim().slice(0, 32) || "iPhone";
  const created = await auth.api.createApiKey({
    body: {
      name: clean,
      userId: owner.userId,
      permissions: { amber: ["draft"] },
      metadata: { kind: "device" },
    },
  });
  refresh();
  return { key: created.key, name: clean };
}

export async function revokeDeviceToken(keyId: string) {
  await requireOwner();
  await auth.api.deleteApiKey({ body: { keyId }, headers: await headers() });
  refresh();
}
