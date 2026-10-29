import { tasks } from "@trigger.dev/sdk";
import type { processMediaTask } from "../../trigger/process-media";
import { env } from "./env";
import { processMedia, type ProcessPayload } from "./process-media";

export async function enqueueProcessing(payload: ProcessPayload) {
  if (env.jobsMode === "inline") {
    // Local development only: no worker, so run it in this process without
    // holding up the response. A failure is recorded on the media row.
    void processMedia(payload).catch((err) => console.error("[amber] processing failed", err));
    return;
  }
  await tasks.trigger<typeof processMediaTask>("process-media", payload, {
    idempotencyKey: `process-media-${payload.mediaId}`,
    idempotencyKeyTTL: "1h",
  });
}
