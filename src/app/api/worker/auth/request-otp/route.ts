import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { canExposeDevOtpInApi } from "@/lib/env/runtime";
import { requestWorkerOtp } from "@/lib/workers/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mobile?: string };
    const mobile = body.mobile?.trim();
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "mobile required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const result = await requestWorkerOtp(supabase, mobile);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      ...(canExposeDevOtpInApi() && result.devOtp ? { devOtp: result.devOtp } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
