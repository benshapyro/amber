import { createUploadSlot, uploadUrlInput } from "@/lib/capture";
import { apiRoute, readJson } from "@/lib/route";

// Step 1 of 3: reserve a media row and get a signed URL to PUT the file to.
export const POST = apiRoute(async ({ req, caller }) =>
  createUploadSlot(caller, uploadUrlInput.parse(await readJson(req))),
);
