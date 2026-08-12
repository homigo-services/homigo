import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getCustomerById,
  getCustomerBookingCount,
  getCustomerLastService,
  updateCustomer,
} from "@/lib/customers/queries";
import type { CustomerUpdateInput } from "@/lib/customers/queries";
import { listBookingsByCustomerId } from "@/lib/bookings/queries";
import { listServiceRequests } from "@/lib/service-requests/queries";
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
    const { data, error, notFound } = await getCustomerById(supabase, id);

    if (notFound || !data) {
      return NextResponse.json(
        { success: false, message: error ?? "Customer not found" },
        { status: 404 },
      );
    }

    const [bookingCount, lastService, bookings, serviceRequests] =
      await Promise.all([
        getCustomerBookingCount(supabase, id),
        getCustomerLastService(supabase, id),
        listBookingsByCustomerId(supabase, id),
        listServiceRequests(supabase, {}),
      ]);

    const customerRequests = serviceRequests.data.filter(
      (sr) => sr.customer_id === id,
    );

    return NextResponse.json({
      success: true,
      customer: data,
      booking_count: bookingCount.count,
      last_service: lastService.service,
      bookings: bookings.data,
      service_requests: customerRequests,
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
    const body = (await request.json()) as CustomerUpdateInput;
    const supabase = createSupabaseServerClient();
    const { data, error } = await updateCustomer(supabase, id, body);

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, customer: data });
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
