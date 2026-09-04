import { devOnlyJsonResponse } from "@/lib/dev/guard";
import { seedHomigoBookingTestData } from "@/lib/dev/seed-homigo-booking-test-data";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export async function POST() {
  const blocked = devOnlyJsonResponse();
  if (blocked) return blocked;

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Supabase unavailable" },
      { status: 500 },
    );
  }

  try {
    const result = await seedHomigoBookingTestData(supabase);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Seed failed",
      },
      { status: 500 },
    );
  }
}
