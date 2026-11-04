import { listInbox } from "@/lib/capture";
import { apiRoute } from "@/lib/route";

// Unattached media, newest first.
export const GET = apiRoute(async ({ caller }) => ({ items: await listInbox(caller) }));
