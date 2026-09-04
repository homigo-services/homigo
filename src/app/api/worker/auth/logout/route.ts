import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
  clearWorkerSessionCookie,
  revokeWorkerSession,
  WORKER_SESSION_COOKIE,
} from "@/lib/workers/auth";

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`${WORKER_SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1] ? decodeURIComponent(match[1]) : null;

    if (token) {
      const supabase = createSupabaseServiceClient();
      await revokeWorkerSession(supabase, token);
    }

    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", clearWorkerSessionCookie());
    return response;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
