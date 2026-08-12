import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceRequestMatchingSummary } from "@/lib/service-requests/matching-summary";
import {
  createServiceRequest,
  listServiceRequests,
} from "@/lib/service-requests/queries";
import type { ServiceRequestCreateInput } from "@/lib/service-requests/queries";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const supabase = createSupabaseServerClient();
    const { data, error } = await listServiceRequests(supabase, {
      status,
      search,
    });

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 500 },
      );
    }

    const withMatching = await Promise.all(
      data.map(async (sr) => ({
        ...sr,
        matching: (await getServiceRequestMatchingSummary(supabase, sr.id)).data,
      })),
    );

    return NextResponse.json({ success: true, service_requests: withMatching });
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
    const body = (await request.json()) as ServiceRequestCreateInput;
    if (
      !body.customer_id ||
      !body.service_type?.trim() ||
      !body.service_date ||
      !body.preferred_time_slot?.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "customer_id, service_type, service_date, and preferred_time_slot are required",
        },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await createServiceRequest(supabase, body);

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, service_request: data });
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
