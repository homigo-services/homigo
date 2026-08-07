import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";
import { dedupeServices } from "@/lib/workers/helpers";
import {
  fetchWorkerByIdWithRelations,
  syncWorkerServices,
} from "@/lib/workers/queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  if (!verifyAdminApiRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { services?: string[] };

    if (!body.services || !Array.isArray(body.services)) {
      return NextResponse.json(
        { success: false, message: "services array is required" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { error } = await syncWorkerServices(
      supabase,
      id,
      dedupeServices(body.services),
    );

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 500 },
      );
    }

    const { data, notFound } = await fetchWorkerByIdWithRelations(
      supabase,
      id,
    );

    if (notFound || !data) {
      return NextResponse.json(
        { success: false, message: "Worker not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Services updated",
      worker: data,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
