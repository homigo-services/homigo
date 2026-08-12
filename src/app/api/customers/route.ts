import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  createCustomer,
  enrichCustomersWithStats,
  listCustomers,
} from "@/lib/customers/queries";
import type { CustomerCreateInput } from "@/lib/customers/queries";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const withStats = searchParams.get("withStats") === "true";

    const supabase = createSupabaseServerClient();
    const { data, error } = await listCustomers(supabase, { status, search });

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 500 },
      );
    }

    if (withStats) {
      const enriched = await enrichCustomersWithStats(supabase, data);
      if (enriched.error) {
        return NextResponse.json(
          { success: false, message: enriched.error },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true, customers: enriched.data });
    }

    return NextResponse.json({ success: true, customers: data });
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
    const body = (await request.json()) as CustomerCreateInput;
    if (!body.name?.trim() || !body.mobile?.trim() || !body.area?.trim()) {
      return NextResponse.json(
        { success: false, message: "Name, mobile, and area are required" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await createCustomer(supabase, body);

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
