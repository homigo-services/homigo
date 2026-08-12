import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { calculateBookingAmounts } from "@/lib/rate-cards/calculator";
import { getRateCardById, updateRateCard } from "@/lib/rate-cards/queries";
import type { RateCardUpdateInput } from "@/lib/rate-cards/queries";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = createSupabaseServerClient();
    const { data, error, notFound } = await getRateCardById(supabase, id);

    if (notFound || !data) {
      return NextResponse.json(
        { success: false, message: error ?? "Rate card not found" },
        { status: 404 },
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

export async function PATCH(request: Request, context: RouteContext) {
  if (!verifyAdminApiRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as RateCardUpdateInput;

    const supabase = createSupabaseServerClient();
    const existing = await getRateCardById(supabase, id);
    if (existing.notFound || !existing.data) {
      return NextResponse.json(
        { success: false, message: "Rate card not found" },
        { status: 404 },
      );
    }

    const merged = { ...existing.data, ...body };
    const amounts = calculateBookingAmounts(merged);

    const { data, error } = await updateRateCard(supabase, id, {
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
