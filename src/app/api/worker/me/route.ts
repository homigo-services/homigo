import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getWorkerSessionFromRequest } from "@/lib/workers/auth";

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseServiceClient();
    const workerId = await getWorkerSessionFromRequest(supabase, request);
    if (!workerId) {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }

    const { data: worker } = await supabase
      .from("workers")
      .select('id, worker_code, "Full name", mobile_number, area, pincode, preferred_language, is_available, status, is_verified')
      .eq("id", workerId)
      .maybeSingle();

    if (!worker) {
      return NextResponse.json({ ok: false, error: "worker_not_found" }, { status: 404 });
    }

    const { data: services } = await supabase
      .from("worker_services")
      .select("service_id, is_active, services(service_name)")
      .eq("worker_id", workerId)
      .eq("is_active", true);

    return NextResponse.json({
      ok: true,
      worker: {
        ...worker,
        services: (services ?? []).map((s) => ({
          service_id: s.service_id,
          name: (s.services as { service_name?: string } | null)?.service_name,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
