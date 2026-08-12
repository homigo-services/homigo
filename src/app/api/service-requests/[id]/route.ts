import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceRequestMatchingSummary } from "@/lib/service-requests/matching-summary";
import {
  getServiceRequestById,
  updateRateCardAccepted,
  updateRateCardSent,
  updateServiceRequestStatus,
} from "@/lib/service-requests/queries";
import type { ServiceRequestStatus } from "@/lib/service-requests/types";
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
    const { data, error, notFound } = await getServiceRequestById(supabase, id);

    if (notFound || !data) {
      return NextResponse.json(
        { success: false, message: error ?? "Service request not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      service_request: data,
      matching: (await getServiceRequestMatchingSummary(supabase, id)).data,
    });
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
    const body = (await request.json()) as {
      status?: ServiceRequestStatus;
      rate_card_sent?: boolean;
      rate_card_accepted?: boolean;
    };

    const supabase = createSupabaseServerClient();

    if (body.status !== undefined) {
      const result = await updateServiceRequestStatus(supabase, id, body.status);
      if (result.error) {
        return NextResponse.json(
          { success: false, message: result.error },
          { status: 400 },
        );
      }
      return NextResponse.json({
        success: true,
        service_request: result.data,
      });
    }

    if (body.rate_card_sent !== undefined) {
      const result = await updateRateCardSent(supabase, id, body.rate_card_sent);
      if (result.error) {
        return NextResponse.json(
          { success: false, message: result.error },
          { status: 400 },
        );
      }
      return NextResponse.json({
        success: true,
        service_request: result.data,
      });
    }

    if (body.rate_card_accepted !== undefined) {
      const result = await updateRateCardAccepted(
        supabase,
        id,
        body.rate_card_accepted,
      );
      if (result.error) {
        return NextResponse.json(
          { success: false, message: result.error },
          { status: 400 },
        );
      }
      return NextResponse.json({
        success: true,
        service_request: result.data,
      });
    }

    return NextResponse.json(
      { success: false, message: "No valid update fields provided" },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
