import { activityLog } from "@/db/schema";
import type { Tx } from "@/db";
import type { Caller } from "./caller";

export async function logActivity(
  tx: Tx,
  caller: Caller,
  entry: { action: string; recordType: string; recordId?: string; details?: Record<string, unknown> },
) {
  await tx.insert(activityLog).values({
    ownerId: caller.userId,
    actor: caller.actor,
    apiKeyId: caller.apiKeyId,
    action: entry.action,
    recordType: entry.recordType,
    recordId: entry.recordId,
    details: entry.details,
  });
}
