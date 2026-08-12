import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getBookingById,
  updateBookingNotes,
  updateBookingStatus,
  updatePaymentInformation,
} from "@/lib/bookings/queries";
import type { PaymentUpdateInput } from "@/lib/bookings/queries";
import type { BookingStatus } from "@/lib/bookings/types";
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
    const { data, error, notFound } = await getBookingById(supabase, id);

    if (notFound || !data) {
      return NextResponse.json(
        { success: false, message: error ?? "Booking not found" },
        { status: 404 },
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

export async function PATCH(request: Request, context: RouteContext) {
  if (!verifyAdminApiRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      booking_status?: BookingStatus;
      cancel_reason?: string | null;
      notes?: string | null;
      payment?: PaymentUpdateInput;
    };

    const supabase = createSupabaseServerClient();

    if (body.booking_status !== undefined) {
      const result = await updateBookingStatus(
        supabase,
        id,
        body.booking_status,
        body.cancel_reason,
      );
      if (result.error) {
        return NextResponse.json(
          { success: false, message: result.error },
          { status: 400 },
        );
      }
      return NextResponse.json({ success: true, booking: result.data });
    }

    if (body.notes !== undefined) {
      const result = await updateBookingNotes(supabase, id, body.notes);
      if (result.error) {
        return NextResponse.json(
          { success: false, message: result.error },
          { status: 400 },
        );
      }
      return NextResponse.json({ success: true, booking: result.data });
    }

    if (body.payment) {
      const result = await updatePaymentInformation(supabase, id, body.payment);
      if (result.error) {
        return NextResponse.json(
          { success: false, message: result.error },
          { status: 400 },
        );
      }
      return NextResponse.json({ success: true, booking: result.data });
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
