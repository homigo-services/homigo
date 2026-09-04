import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getWorkerSessionFromRequest } from "@/lib/workers/auth";
import { formatIsoAsDdMmYyyy } from "@/lib/whatsapp/slots";

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseServiceClient();
    const workerId = await getWorkerSessionFromRequest(supabase, request);
    if (!workerId) {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }

    const { data: bookings } = await supabase
      .from("booking")
      .select(
        "id, booking_status, payment_status, service_date, service_time_slot, final_amount, worker_earning, sevice_request_id, otp_verified, completion_otp_hash, otp_expires_at, otp_attempts, Payment_mode",
      )
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false })
      .limit(30);

    const now = Date.now();
    const rows = [];
    for (const b of bookings ?? []) {
      const { data: sr } = await supabase
        .from("service-request")
        .select("service_type, area, preferred_time_slot")
        .eq("id", b.sevice_request_id)
        .maybeSingle();

      const otpPending =
        !b.otp_verified &&
        Boolean(b.completion_otp_hash) &&
        (b.otp_attempts ?? 0) < 5 &&
        b.otp_expires_at &&
        new Date(String(b.otp_expires_at)).getTime() > now;

      rows.push({
        id: b.id,
        booking_status: b.booking_status,
        payment_status: b.payment_status,
        service_date: b.service_date
          ? formatIsoAsDdMmYyyy(String(b.service_date))
          : null,
        time_slot: sr?.preferred_time_slot ?? b.service_time_slot,
        service_type: sr?.service_type,
        area: sr?.area,
        final_amount: b.final_amount,
        worker_earning: b.worker_earning,
        otp_verified: Boolean(b.otp_verified),
        otp_pending: otpPending,
        payment_mode: b.Payment_mode,
        can_request_otp:
          !b.otp_verified &&
          (b.booking_status === "assigned" || b.booking_status === "in_progress"),
        can_verify_otp: otpPending,
        can_confirm_cash:
          Boolean(b.otp_verified) &&
          String(b.Payment_mode ?? "").toLowerCase() === "cash" &&
          String(b.payment_status ?? "") === "pending",
      });
    }

    return NextResponse.json({ ok: true, bookings: rows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
