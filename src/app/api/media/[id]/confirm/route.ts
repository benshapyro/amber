import { z } from "zod";
import { confirmInput, confirmUpload, toMediaView } from "@/lib/capture";
import { enqueueProcessing } from "@/lib/jobs";
import { apiRoute, readJson } from "@/lib/route";

// Step 3 of 3: the file is in R2. Record it, attach it to a draft moment if
// it came with a note, and start the background job.
export const POST = apiRoute<{ id: string }>(async ({ req, caller, params }) => {
  const id = z.uuid().parse(params.id);
  const { row, enqueue } = await confirmUpload(caller, id, confirmInput.parse(await readJson(req)));
  if (enqueue) await enqueueProcessing({ ownerId: caller.userId, mediaId: id });
  return toMediaView(row);
});
