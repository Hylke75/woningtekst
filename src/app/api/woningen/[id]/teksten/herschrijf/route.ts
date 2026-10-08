import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data/properties";
import { json, parseJson, route } from "@/lib/api";
import { rewriteBody } from "@/lib/api-text-schemas";
import { rewriteText } from "@/lib/pipeline/single";
import { assertTextsAllowed } from "@/lib/pipeline/guards";

export const maxDuration = 300;

export const POST = route<RouteContext<"/api/woningen/[id]/teksten/herschrijf">>(async (req, { params }) => {
  const session = await requireSession("texts.edit");
  const { id } = await params;
  const property = await getProperty(id);
  const body = await parseJson(req, rewriteBody, 10_000);
  assertTextsAllowed(property);
  const supabase = await createClient();
  const { result } = await rewriteText({ supabase, session, property, ...body });
  return json({ result });
});
