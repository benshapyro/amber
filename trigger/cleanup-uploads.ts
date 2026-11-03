import { schedules } from "@trigger.dev/sdk";
import { sweepAbandonedUploads } from "@/lib/cleanup";

// Nightly: finish uploads whose confirm never arrived, and hide the ones
// whose file never did.
export const cleanupUploadsTask = schedules.task({
  id: "cleanup-uploads",
  cron: "15 4 * * *",
  run: async () => sweepAbandonedUploads(),
});
