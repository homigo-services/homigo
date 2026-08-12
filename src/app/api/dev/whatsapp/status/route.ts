import { devOnlyJsonResponse } from "@/lib/dev/guard";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getServiceRequestMatchingSummary } from "@/lib/service-requests/matching-summary";
import { fetchServiceCatalog } from "@/lib/workers/service-resolver";
import { listOffersForServiceRequest } from "@/lib/workers/offers";
import { getBatchStatus } from "@/lib/workers/matching";
import { normalizeWhatsAppMobile } from "@/lib/whatsapp/parser";

export async function GET(request: Request) {
  const blocked = devOnlyJsonResponse();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const mobile = normalizeWhatsAppMobile(searchParams.get("mobile") ?? "");

  if (!mobile) {
    return Response.json({ error: "mobile query param required" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Supabase service client unavailable",
      },
      { status: 500 },
    );
  }

  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("mobile", mobile)
    .maybeSingle();

  let serviceRequest = null;
  const srId =
    conversation?.service_request_id ??
    (conversation?.context as Record<string, unknown> | null)?.service_request_id;

  if (srId) {
    const { data } = await supabase
      .from("service-request")
      .select("*")
      .eq("id", String(srId))
      .maybeSingle();
    serviceRequest = data;
  }

  const { data: catalog } = await fetchServiceCatalog(supabase);
  const { data: activeRows } = await supabase
    .from("services")
    .select("id")
    .eq("is_active", true);

  const activeIds = new Set((activeRows ?? []).map((r) => String(r.id)));
  const services = catalog
    .filter((s) => activeIds.size === 0 || activeIds.has(s.id))
    .map((s, i) => ({ index: i + 1, id: s.id, name: s.name }));

  const plumber = services.find((s) => s.name.toLowerCase() === "plumber");

  let matching = null;
  let offers: unknown[] = [];
  let batch = null;
  let booking = null;
  let devAcceptLinks =
    (conversation?.context as Record<string, unknown> | null)?.dev_accept_links ?? [];

  const bookingIdFromConv =
    conversation?.booking_id ??
    (conversation?.context as Record<string, unknown> | null)?.booking_id;

  if (srId) {
    const summary = await getServiceRequestMatchingSummary(supabase, String(srId));
    matching = summary.data;
    const offerList = await listOffersForServiceRequest(supabase, String(srId));
    offers = offerList.data;
    const batchStatus = await getBatchStatus(supabase, String(srId), 1);
    batch = batchStatus.data;

    if (summary.data.booking_id) {
      const { data: bookingRow } = await supabase
        .from("booking")
        .select("*")
        .eq("id", summary.data.booking_id)
        .maybeSingle();
      booking = bookingRow;
    }
  }

  if (!booking && bookingIdFromConv) {
    const { data: bookingRow } = await supabase
      .from("booking")
      .select("*")
      .eq("id", String(bookingIdFromConv))
      .maybeSingle();
    booking = bookingRow;
  }

  const context = (conversation?.context as Record<string, unknown> | null) ?? null;

  return Response.json({
    mobile,
    conversation,
    customer,
    serviceRequest,
    services,
    plumberMenuNumber: plumber?.index ?? null,
    matching,
    batch,
    offers,
    booking,
    devAcceptLinks,
    confirmation: context
      ? {
          sent_at: context.confirmation_sent_at ?? null,
          phase: context.phase ?? null,
          booking_ref: context.booking_ref ?? null,
          final_amount: context.final_amount ?? booking?.final_amount ?? null,
          payment_mode: booking?.Payment_mode ?? context.payment_mode ?? null,
          payment_status: booking?.payment_status ?? null,
        }
      : null,
    otp: booking
      ? {
          has_hash: Boolean(booking.completion_otp_hash),
          generated_at: booking.otp_generated_at ?? null,
          expires_at: booking.otp_expires_at ?? null,
          attempts: booking.otp_attempts ?? 0,
          verified: booking.otp_verified ?? false,
          verified_at: booking.otp_verified_at ?? null,
          dev_otp:
            process.env.WHATSAPP_MOCK_SEND === "true"
              ? ((context?.dev_completion_otp as string | undefined) ?? null)
              : null,
        }
      : null,
    completion: context
      ? {
          cash_completion_sent_at: context.cash_completion_sent_at ?? null,
          payment_completed_at: context.payment_completed_at ?? null,
          payment_received_at: booking?.payment_received_at ?? null,
        }
      : null,
  });
}
