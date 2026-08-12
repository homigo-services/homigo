import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { calculateBookingAmounts } from "@/lib/rate-cards/calculator";
import { createRateCard, listRateCards } from "@/lib/rate-cards/queries";
import type { RateCardCreateInput } from "@/lib/rate-cards/queries";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const supabase = createSupabaseServerClient();
    const { data, error } = await listRateCards(supabase, { activeOnly });

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, rate_cards: data });
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!verifyAdminApiRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const body = (await request.json()) as RateCardCreateInput;
    if (!body.service_id) {
      return NextResponse.json(
        { success: false, message: "service_id is required" },
        { status: 400 },
      );
    }

    const amounts = calculateBookingAmounts({
      base_amount: body.base_amount ?? 0,
      lead_charge: body.lead_charge ?? 0,
      platform_commission: body.platform_commission ?? 0,
      worker_earning: body.worker_earning ?? 0,
    });

    const supabase = createSupabaseServerClient();
    const { data, error } = await createRateCard(supabase, {
      ...body,
      worker_earning: body.worker_earning ?? amounts.worker_earning,
    });

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, rate_card: data });
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
