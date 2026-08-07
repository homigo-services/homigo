import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  unauthorizedAdminResponse,
  verifyAdminApiRequest,
} from "@/lib/workers/api-auth";
import { documentKeyToType } from "@/lib/workers/documents";
import { uploadWorkerDocumentToStorage } from "@/lib/workers/document-upload-server";

export async function POST(request: Request) {
  if (!verifyAdminApiRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const documentKey = String(formData.get("documentKey") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "File upload failed: no file received." },
        { status: 400 },
      );
    }

    if (!documentKey) {
      return NextResponse.json(
        { success: false, message: "File upload failed: missing document type." },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const supabase = createSupabaseServerClient();
    const { url, error } = await uploadWorkerDocumentToStorage(
      supabase,
      bytes,
      file.name,
      file.type,
      documentKey,
    );

    if (error || !url) {
      return NextResponse.json(
        { success: false, message: error ?? "File upload failed." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      url,
      fileName: file.name,
      documentType: documentKeyToType(documentKey),
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? `File upload failed: ${err.message}`
        : "File upload failed.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
