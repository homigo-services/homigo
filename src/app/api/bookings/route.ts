import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  createBooking,
  listBookings,
} from "@/lib/bookings/queries";
import type { BookingCreateInput } from "@/lib/bookings/queries";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const paymentStatus = searchParams.get("paymentStatus") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

    const supabase = createSupabaseServerClient();
    const { data, error } = await listBookings(supabase, {
      status,
      paymentStatus,
      search,
      limit,
    });

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, bookings: data });
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
    const body = (await request.json()) as BookingCreateInput;
    if (
      !body.sevice_request_id ||
      !body.customer_id ||
      !body.worker_id ||
      !body.service_date
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "sevice_request_id, customer_id, worker_id, and service_date are required",
        },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await createBooking(supabase, body);

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, booking: data });
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
