"use client";

import type { WorkerDocumentField } from "@/lib/workers/types";
import { isImageUrl, toPreviewUrl } from "@/lib/workers/helpers";

interface DocumentPreviewProps {
  documents: WorkerDocumentField[];
}

function statusLabel(status: WorkerDocumentField["verificationStatus"]): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "rejected":
      return "Rejected";
    case "pending_review":
      return "Pending Review";
    default:
      return "Not Uploaded";
  }
}

function DocumentCard({ doc }: { doc: WorkerDocumentField }) {
  const previewUrl = toPreviewUrl(doc.url);
  const isImage = isImageUrl(doc.url);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-homigo-primary">{doc.label}</p>
          <p className="mt-1 text-xs text-slate-500">{statusLabel(doc.verificationStatus)}</p>
        </div>
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-blue-900 px-4 py-2 text-sm text-white hover:bg-blue-800"
        >
          Open in new tab
        </a>
      </div>

      {isImage ? (
        <div className="mt-4 overflow-hidden rounded-lg border bg-white">
          <img
            src={previewUrl}
            alt={doc.label}
            className="max-h-64 w-full object-contain"
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          PDF and other file types open safely in a new browser tab. Inline
          preview is not used to avoid blocked embed frames.
        </p>
      )}
    </div>
  );
}

export function DocumentPreview({ documents }: DocumentPreviewProps) {
  if (documents.length === 0) {
    return (
      <p className="text-sm text-slate-500">No documents uploaded.</p>
    );
  }

  return (
    <div className="space-y-4">
      {documents.map((doc) => (
        <DocumentCard key={`${doc.label}-${doc.url}`} doc={doc} />
      ))}
    </div>
  );
}
