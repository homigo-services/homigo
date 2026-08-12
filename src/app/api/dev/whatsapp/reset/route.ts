import { devOnlyJsonResponse } from "@/lib/dev/guard";
import { resetWhatsAppTestCustomer } from "@/lib/dev/whatsapp-test-cleanup";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { normalizeWhatsAppMobile } from "@/lib/whatsapp/parser";

export async function POST(request: Request) {
  const blocked = devOnlyJsonResponse();
  if (blocked) return blocked;

  let body: { mobile?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mobile = normalizeWhatsAppMobile(body.mobile ?? "");
  if (!mobile) {
    return Response.json({ error: "mobile required" }, { status: 400 });
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

  const result = await resetWhatsAppTestCustomer(supabase, mobile);
  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({ ok: true, mobile });
}
