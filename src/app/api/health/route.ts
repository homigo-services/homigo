import { NextResponse } from "next/server";
import { getProductionMockMisconfigWarnings } from "@/lib/env/runtime";
import { getRazorpayConfig } from "@/lib/payments/razorpay";
import { getWhatsappConfigStatus } from "@/lib/whatsapp/config";

/** Public health check — no secrets in response. */
export async function GET() {
  const mockWarnings = getProductionMockMisconfigWarnings();
  const whatsapp = getWhatsappConfigStatus();
  const razorpay = getRazorpayConfig();

  const checks = {
    supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabase_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    cron_secret: Boolean(process.env.CRON_SECRET?.trim()),
    whatsapp_configured: whatsapp.complete,
    whatsapp_app_secret: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
    sms_provider: Boolean(
      (process.env.SMS_PROVIDER ?? "none").trim() !== "none" ||
        process.env.SMS_TWILIO_ACCOUNT_SID ||
        process.env.SMS_MSG91_AUTH_KEY,
    ),
    razorpay_configured: Boolean(razorpay && !razorpay.mockMode),
    app_url: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
    workers_import_secret: Boolean(process.env.WORKERS_IMPORT_SECRET?.trim()),
    admin_api_secret: Boolean(process.env.ADMIN_API_SECRET?.trim()),
  };

  const criticalOk =
    checks.supabase_url &&
    checks.supabase_service_role &&
    checks.cron_secret &&
    checks.app_url &&
    mockWarnings.length === 0;

  return NextResponse.json(
    {
      ok: criticalOk,
      service: "homigo",
      environment: process.env.NODE_ENV ?? "unknown",
      checks,
      warnings: mockWarnings,
    },
    { status: criticalOk ? 200 : 503 },
  );
}
