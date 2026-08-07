import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";
import {
  ensureWorkerDocumentRecord,
  getDocumentUrlFromWorker,
  getWorkerDocumentSlots,
  updateWorkerDocumentVerification,
} from "@/lib/workers/documents";
import { mapWorkerError } from "@/lib/workers/errors";
import { fetchWorkerByIdWithRelations } from "@/lib/workers/queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  if (!verifyAdminApiRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const { id: workerId } = await context.params;
    const body = (await request.json()) as {
      documentType?: string;
      action?: "verify" | "reject";
      rejectionReason?: string;
      verifiedBy?: string;
    };

    if (!body.documentType?.trim()) {
      return NextResponse.json(
        { success: false, message: "documentType is required" },
        { status: 400 },
      );
    }

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
    const { data: worker, notFound } = await fetchWorkerByIdWithRelations(
      supabase,
      workerId,
    );

    if (notFound || !worker) {
      return NextResponse.json(
        { success: false, message: "Worker not found" },
        { status: 404 },
      );
    }

    const url = getDocumentUrlFromWorker(worker, body.documentType);
    if (!url) {
      return NextResponse.json(
        { success: false, message: "Document has not been uploaded." },
        { status: 400 },
      );
    }

    const { documentId, error: ensureError } = await ensureWorkerDocumentRecord(
      supabase,
      workerId,
      body.documentType,
      url,
    );

    if (ensureError || !documentId) {
      return NextResponse.json(
        { success: false, message: mapWorkerError(ensureError ?? "Could not link document") },
        { status: 400 },
      );
    }

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

    const { data: refreshed } = await fetchWorkerByIdWithRelations(supabase, workerId);
    const slot = getWorkerDocumentSlots(refreshed ?? worker).find(
      (entry) => entry.documentType === body.documentType,
    );

    return NextResponse.json({
      success: true,
      message:
        body.action === "verify"
          ? "Document verified successfully"
          : "Document rejected",
      document_id: documentId,
      verification_status: slot?.verificationStatus ?? body.action,
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
