import { task } from "@trigger.dev/sdk";
import { processMedia, type ProcessPayload } from "@/lib/process-media";

export const processMediaTask = task({
  id: "process-media",
  // A 48 MP HEIC decodes to ~200 MB of pixels; small-1x (0.5 GB) is tight.
  machine: "medium-1x",
  maxDuration: 600,
  retry: { maxAttempts: 4, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60_000 },
  queue: { concurrencyLimit: 4 },
  run: async (payload: ProcessPayload) => processMedia(payload),
});
