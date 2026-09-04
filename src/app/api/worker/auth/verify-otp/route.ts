import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { buildWorkerSessionCookie, verifyWorkerOtp } from "@/lib/workers/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mobile?: string; otp?: string };
    const mobile = body.mobile?.trim();
    const otp = body.otp?.trim();
    if (!mobile || !otp) {
      return NextResponse.json({ ok: false, error: "mobile and otp required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const result = await verifyWorkerOtp(supabase, mobile, otp);

    if (!result.ok || !result.sessionToken) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, worker_id: result.workerId });
    response.headers.set("Set-Cookie", buildWorkerSessionCookie(result.sessionToken));
    return response;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
