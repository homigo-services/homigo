import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";
import { updateWorkerDocumentVerification } from "@/lib/workers/documents";
import { mapWorkerError } from "@/lib/workers/errors";

interface RouteContext {
  params: Promise<{ id: string; documentId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!verifyAdminApiRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const { documentId } = await context.params;
    const body = (await request.json()) as {
      action?: "verify" | "reject";
      rejectionReason?: string;
      verifiedBy?: string;
    };

    if (body.action !== "verify" && body.action !== "reject") {
      return NextResponse.json(
        { success: false, message: "action must be verify or reject" },
        { status: 400 },
      );
    }

    if (body.action === "reject" && !body.rejectionReason?.trim()) {
      return NextResponse.json(
        { success: false, message: "Rejection reason is required." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { error } = await updateWorkerDocumentVerification(
      supabase,
      documentId,
      body.action,
      {
        rejectionReason: body.rejectionReason,
        verifiedBy: body.verifiedBy,
      },
    );

    if (error) {
      return NextResponse.json(
        { success: false, message: mapWorkerError(error) },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        body.action === "verify"
          ? "Document verified successfully"
          : "Document rejected",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, message: mapWorkerError(message) },
      { status: 500 },
    );
  }
}
