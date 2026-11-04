import { z } from "zod";
import { getMedia } from "@/lib/capture";
import { apiRoute } from "@/lib/route";

export const GET = apiRoute<{ id: string }>(async ({ caller, params }) => getMedia(caller, z.uuid().parse(params.id)));
