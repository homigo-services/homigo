import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { processExpiredWorkerOffers } from "@/lib/workers/batch-matching";
import { sendWorkerNotFoundMessages } from "@/lib/workers/customer-notify";

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  return bearer === secret;
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseServiceClient();
    const result = await processExpiredWorkerOffers(supabase);
    await sendWorkerNotFoundMessages(supabase);

    return NextResponse.json({
      ok: true,
      expired: result.processed,
      batches_advanced: result.advanced,
      errors: result.errors,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
