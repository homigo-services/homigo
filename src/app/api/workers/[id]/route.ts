import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";
import { mapWorkerError } from "@/lib/workers/errors";
import { dedupeServices } from "@/lib/workers/helpers";
import {
  fetchWorkerByIdWithRelations,
  softDeleteWorker,
  syncWorkerServices,
} from "@/lib/workers/queries";
import { canApproveWorker } from "@/lib/workers/verification-rules";
import {
  getStatusUpdatesForAction,
  parseWorkerPatchBody,
} from "@/lib/workers/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = createSupabaseServerClient();
    const { data, error, notFound } = await fetchWorkerByIdWithRelations(
      supabase,
      id,
    );

    if (notFound || !data) {
      return NextResponse.json(
        { success: false, message: error ?? "Worker not found" },
        { status: 404 },
      );
    }

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, worker: data });
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
    const parsed = parseWorkerPatchBody(await request.json());

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, message: parsed.message },
        { status: 400 },
      );
    }

    const body = parsed.data;
    const supabase = createSupabaseServerClient();

    if (body.action === "approve") {
      const { data: current } = await fetchWorkerByIdWithRelations(supabase, id);
      if (!current) {
        return NextResponse.json(
          { success: false, message: "Worker not found" },
          { status: 404 },
        );
      }
      const approval = canApproveWorker(current);
      if (!approval.ok) {
        return NextResponse.json(
          {
            success: false,
            message: approval.blockers.join(" "),
          },
          { status: 400 },
        );
      }
    }

    if (body.action === "activate") {
      const { data: current } = await fetchWorkerByIdWithRelations(supabase, id);
      if (!current?.is_verified) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Worker must be approved before activation. Use Approve Worker first.",
          },
          { status: 400 },
        );
      }
    }

    if (body.action && body.action !== "update") {
      const updates = getStatusUpdatesForAction(body.action, body.note);

      let updateQuery = supabase.from("workers").update(updates).eq("id", id);

      if (body.action !== "restore") {
        updateQuery = updateQuery.is("deleted_at", null);
      }

      const { error: updateError } = await updateQuery;

      if (updateError) {
        return NextResponse.json(
          { success: false, message: mapWorkerError(updateError.message) },
          { status: 500 },
        );
      }
    }

    if (body.worker && Object.keys(body.worker).length > 0) {
      const { error: profileError } = await supabase
        .from("workers")
        .update({
          ...body.worker,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("deleted_at", null);

      if (profileError) {
        return NextResponse.json(
          { success: false, message: mapWorkerError(profileError.message) },
          { status: 500 },
        );
      }
    }

    if (body.services) {
      const { error: servicesError } = await syncWorkerServices(
        supabase,
        id,
        dedupeServices(body.services),
      );

      if (servicesError) {
        return NextResponse.json(
          { success: false, message: mapWorkerError(servicesError) },
          { status: 500 },
        );
      }
    }

    const { data, error, notFound } = await fetchWorkerByIdWithRelations(
      supabase,
      id,
    );

    if (notFound || !data) {
      return NextResponse.json(
        { success: false, message: "Worker not found after update" },
        { status: 404 },
      );
    }

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 500 },
      );
    }

    const actionMessages: Record<string, string> = {
      approve: "Worker verified successfully.",
      reject: "Worker rejected.",
      deactivate: "Worker deactivated successfully.",
      activate: "Worker activated successfully.",
      restore: "Worker restored for review.",
      set_available: "Worker marked available.",
      set_unavailable: "Worker marked unavailable.",
    };

    return NextResponse.json({
      success: true,
      message:
        body.action && actionMessages[body.action]
          ? actionMessages[body.action]
          : "Worker updated successfully",
      worker: data,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!verifyAdminApiRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const { id } = await context.params;
    const supabase = createSupabaseServerClient();
    const { error } = await softDeleteWorker(supabase, id);

    if (error) {
      return NextResponse.json(
        { success: false, message: error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Worker archived successfully",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
