import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getActiveRateCard } from "@/lib/bookings/rate-card";
import { resolveServiceId } from "@/lib/workers/matching";
import { getWorkerSessionFromRequest } from "@/lib/workers/auth";
import { formatIsoAsDdMmYyyy } from "@/lib/whatsapp/slots";

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseServiceClient();
    const workerId = await getWorkerSessionFromRequest(supabase, request);
    if (!workerId) {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }

    const now = new Date().toISOString();
    const { data: offers } = await supabase
      .from("worker_service_offers")
      .select(
        "id, status, expires_at, batch_number, offered_at, service_request_id",
      )
      .eq("worker_id", workerId)
      .in("status", ["pending", "accepted", "rejected", "expired", "cancelled"])
      .order("offered_at", { ascending: false })
      .limit(20);

    const enriched = [];
    for (const offer of offers ?? []) {
      const { data: sr } = await supabase
        .from("service-request")
        .select("service_type, area, service_date, preferred_time_slot")
        .eq("id", offer.service_request_id)
        .maybeSingle();

      let estimated_earning: number | null = null;
      if (sr?.service_type && sr.service_date) {
        const resolved = await resolveServiceId(supabase, {
          serviceType: String(sr.service_type),
        });
        if (resolved.serviceId) {
          const rate = await getActiveRateCard(
            supabase,
            resolved.serviceId,
            String(sr.service_date),
          );
          estimated_earning = rate.amounts?.worker_earning ?? null;
        }
      }

      enriched.push({
        id: offer.id,
        status: offer.status,
        expires_at: offer.expires_at,
        batch_number: offer.batch_number,
        offered_at: offer.offered_at,
        service_type: sr?.service_type ?? null,
        area: sr?.area ?? null,
        service_date: sr?.service_date
          ? formatIsoAsDdMmYyyy(String(sr.service_date))
          : null,
        preferred_time_slot: sr?.preferred_time_slot ?? null,
        estimated_earning,
        is_expired:
          offer.status === "pending" && String(offer.expires_at) <= now,
      });
    }

    return NextResponse.json({ ok: true, offers: enriched });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
