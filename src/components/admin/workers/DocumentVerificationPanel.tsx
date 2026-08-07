"use client";

import { useState } from "react";
import type { WorkerDocumentSlot } from "@/lib/workers/types";
import { formatDate, isImageUrl, isPdfUrl, toPreviewUrl } from "@/lib/workers/helpers";

interface DocumentVerificationPanelProps {
  workerId: string;
  slots: WorkerDocumentSlot[];
  onUpdated: () => void;
}

function statusBadgeClass(status: WorkerDocumentSlot["verificationStatus"]): string {
  switch (status) {
    case "verified":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case "pending_review":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function statusLabel(status: WorkerDocumentSlot["verificationStatus"]): string {
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

function fileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split("/").filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : "Document file";
  } catch {
    const segment = url.split("/").filter(Boolean).pop();
    return segment ?? "Document file";
  }
}

function DocumentSlotCard({
  workerId,
  slot,
  onUpdated,
}: {
  workerId: string;
  slot: WorkerDocumentSlot;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState<"verify" | "reject" | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  const hasFile = Boolean(slot.url);
  const previewUrl = slot.url ? toPreviewUrl(slot.url) : null;
  const fileName = slot.url ? fileNameFromUrl(slot.url) : null;
  const canReview =
    hasFile && slot.verificationStatus !== "verified";

  async function handleAction(action: "verify" | "reject") {
    if (!hasFile) return;

    if (action === "reject" && !rejectReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    setLoading(action);
    setError(null);

    const payload = {
      action,
      rejectionReason: action === "reject" ? rejectReason.trim() : undefined,
    };

    const response = slot.document?.id
      ? await fetch(`/api/workers/${workerId}/documents/${slot.document.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/workers/${workerId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType: slot.documentType,
            ...payload,
          }),
        });

    const json = (await response.json()) as {
      success: boolean;
      message?: string;
    };

    if (!response.ok || !json.success) {
      setError(json.message ?? "Could not update document.");
      setLoading(null);
      return;
    }

    setShowReject(false);
    setRejectReason("");
    setLoading(null);
    onUpdated();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-homigo-primary">{slot.label}</p>
          <p className="mt-1 text-sm text-slate-600">
            {hasFile ? `Uploaded — ${fileName}` : "Missing"}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(slot.verificationStatus)}`}
          >
            {statusLabel(slot.verificationStatus)}
          </span>
          {slot.verifiedAt && (
            <p className="mt-2 text-xs text-slate-500">
              Updated: {formatDate(slot.verifiedAt)}
              {slot.verifiedBy ? ` by ${slot.verifiedBy}` : ""}
            </p>
          )}
          {slot.rejectionReason && (
            <p className="mt-2 text-xs text-red-700">
              Reason: {slot.rejectionReason}
            </p>
          )}
        </div>

        {canReview && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => handleAction("verify")}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {loading === "verify" ? "Verifying..." : "Verify"}
            </button>
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => {
                setShowReject((value) => !value);
                setError(null);
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {!hasFile ? (
        <p className="mt-4 text-sm text-slate-500">No file uploaded.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <a
            href={slot.url!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            {slot.url && isPdfUrl(slot.url) ? "Open PDF in new tab" : "Open document"}
          </a>

          {previewUrl && isImageUrl(slot.url!) && !previewError ? (
            <div className="overflow-hidden rounded-lg border bg-white">
              <img
                src={previewUrl}
                alt={slot.label}
                className="max-h-64 w-full object-contain"
                onError={() => setPreviewError(true)}
              />
            </div>
          ) : (
            <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
              Inline preview is not used for PDFs or blocked embeds. Open the
              document in a new tab to view it safely.
            </div>
          )}
        </div>
      )}

      {showReject && (
        <div className="mt-4 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-red-900">
              Rejection reason *
            </span>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              className="min-h-20 w-full rounded-lg border border-red-200 px-3 py-2 text-sm"
              placeholder="Explain why this document is rejected..."
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => handleAction("reject")}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading === "reject" ? "Rejecting..." : "Confirm Reject"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReject(false);
                setRejectReason("");
                setError(null);
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function DocumentVerificationPanel({
  workerId,
  slots,
  onUpdated,
}: DocumentVerificationPanelProps) {
  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <DocumentSlotCard
          key={slot.documentType}
          workerId={workerId}
          slot={slot}
          onUpdated={onUpdated}
        />
      ))}
    </div>
  );
}
