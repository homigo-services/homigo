import { devOnlyJsonResponse } from "@/lib/dev/guard";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { matchWorkersForServiceRequest } from "@/lib/workers/matching";

export async function GET(request: Request) {
  const blocked = devOnlyJsonResponse();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("serviceId") ?? undefined;
  const serviceType = searchParams.get("serviceType") ?? undefined;
  const area = searchParams.get("area") ?? "";
  const pincode = searchParams.get("pincode") ?? "";

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Supabase unavailable" },
      { status: 500 },
    );
  }

  const result = await matchWorkersForServiceRequest(supabase, {
    serviceId,
    serviceType,
    area,
    pincode,
  });

  return Response.json(result);
}
