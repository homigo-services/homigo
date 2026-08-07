import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";
import { documentUrlsFromImportInput } from "@/lib/workers/documents";
import { mapWorkerError } from "@/lib/workers/errors";
import { dedupeServices } from "@/lib/workers/helpers";
import { buildWorkerInsertFields } from "@/lib/workers/import-fields";
import { validateImportWorkerInput } from "@/lib/workers/import-validation";
import {
  fetchWorkerByIdWithRelations,
  importWorkerWithServices,
} from "@/lib/workers/queries";
import { getVerificationSummary } from "@/lib/workers/verification-rules";
import type { ImportWorkerInput } from "@/lib/workers/types";

export async function POST(request: Request) {
  if (!verifyAdminApiRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const input = (await request.json()) as ImportWorkerInput;

    const validation = validateImportWorkerInput(input);
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, message: validation.message },
        { status: 400 },
      );
    }

    const workerFields = buildWorkerInsertFields(input);
    const documents = documentUrlsFromImportInput(input);
    const supabase = createSupabaseServerClient();

    const result = await importWorkerWithServices(
      supabase,
      workerFields,
      dedupeServices(input.services),
      documents,
    );

    if (result.error || !result.workerId) {
      return NextResponse.json(
        {
          success: false,
          message: mapWorkerError(result.error ?? "Failed to import worker"),
        },
        { status: result.error?.includes("Duplicate") ? 409 : 400 },
      );
    }

    const { data: worker } = await fetchWorkerByIdWithRelations(
      supabase,
      result.workerId,
    );

    const summary = worker ? getVerificationSummary(worker) : null;

    return NextResponse.json({
      success: true,
      worker_id: result.workerId,
      worker_code: result.workerCode ?? worker?.worker_code ?? workerFields.worker_code,
      worker_name: worker?.["Full name"] ?? input.fullName.trim(),
      services_count: result.servicesCount,
      documents_count: result.documentsCount,
      verification_status: summary?.workerVerificationStatus ?? "Pending Verification",
      documents_pending_review: summary?.pendingCount ?? result.documentsCount,
      message: "Worker imported successfully",
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
