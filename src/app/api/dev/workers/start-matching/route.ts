import { devOnlyJsonResponse } from "@/lib/dev/guard";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { startWorkerMatchingBatch1 } from "@/lib/workers/offers";

export async function POST(request: Request) {
  const blocked = devOnlyJsonResponse();
  if (blocked) return blocked;

  let body: {
    serviceRequestId?: string;
    serviceId?: string;
    serviceType?: string;
    area?: string;
    pincode?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.serviceRequestId) {
    return Response.json({ error: "serviceRequestId required" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Supabase unavailable" },
      { status: 500 },
    );
  }

  const result = await startWorkerMatchingBatch1(supabase, {
    serviceRequestId: body.serviceRequestId,
    serviceId: body.serviceId,
    serviceType: body.serviceType,
    area: body.area ?? "",
    pincode: body.pincode ?? "",
  });

  return Response.json(result);
}
