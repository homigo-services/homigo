import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  getWorkersEnvStatus,
} from "@/lib/supabase-server";
import {
  unauthorizedImportResponse,
  verifyWorkersImportSecret,
} from "@/lib/workers/api-auth";
import { mapWorkerError } from "@/lib/workers/errors";
import {
  buildWorkerInsertFields,
  googleFormPayloadToImportInput,
} from "@/lib/workers/import-fields";
import { documentUrlsFromImportInput } from "@/lib/workers/documents";
import { validateImportWorkerInput } from "@/lib/workers/import-validation";
import {
  fetchWorkersWithRelations,
  importWorkerWithServices,
} from "@/lib/workers/queries";
import type { GoogleFormWorkerPayload } from "@/lib/workers/types";

export async function GET(request: Request) {
  if (!verifyWorkersImportSecret(request)) {
    return unauthorizedImportResponse();
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await fetchWorkersWithRelations(supabase);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: error,
          configured: getWorkersEnvStatus(),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      workers: data,
      configured: getWorkersEnvStatus(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      {
        success: false,
        message,
        configured: getWorkersEnvStatus(),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!verifyWorkersImportSecret(request)) {
    return unauthorizedImportResponse();
  }

  try {
    const payload = (await request.json()) as GoogleFormWorkerPayload;
    const input = googleFormPayloadToImportInput(payload);

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
    const { workerId, error, servicesCount, documentsCount, workerCode } =
      await importWorkerWithServices(
      supabase,
      workerFields,
      input.services,
      documents,
    );

    if (error || !workerId) {
      return NextResponse.json(
        {
          success: false,
          message: mapWorkerError(error ?? "Failed to import worker"),
        },
        { status: error?.includes("Duplicate") ? 409 : 400 },
      );
    }

    return NextResponse.json({
      success: true,
      worker_id: workerId,
      worker_code: workerCode ?? workerFields.worker_code,
      worker_name: input.fullName.trim(),
      services_count: servicesCount,
      documents_count: documentsCount,
      message: "Worker imported successfully",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}
