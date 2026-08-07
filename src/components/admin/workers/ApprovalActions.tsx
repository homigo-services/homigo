"use client";

import { useState } from "react";
import { patchWorkerClient } from "@/lib/workers/client-api";
import type { Worker } from "@/lib/workers/types";
import {
  canApproveWorker,
  getRequiredVerificationDocumentLabels,
} from "@/lib/workers/verification-rules";

interface ApprovalActionsProps {
  worker: Worker;
  onUpdated: (worker?: Worker) => void;
  compact?: boolean;
}

type ActionType =
  | "approve"
  | "reject"
  | "deactivate"
  | "activate"
  | "restore"
  | "set_available"
  | "set_unavailable";

export function ApprovalActions({
  worker,
  onUpdated,
  compact = false,
}: ApprovalActionsProps) {
  const [loading, setLoading] = useState<ActionType | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { is_verified: isVerified, status } = worker;
  const isPending = !isVerified || status === "pending";
  const isRejected = status === "rejected";
  const isActive = isVerified && status === "active";
  const isInactive = status === "inactive";
  const approvalCheck = canApproveWorker(worker);

  async function handleAction(action: ActionType) {
    if (action === "approve" && !approvalCheck.ok) {
      setError(approvalCheck.blockers.join(" "));
      return;
    }

    if (
      action === "reject" &&
      !confirm("Reject this worker application? They will be marked as rejected.")
    ) {
      return;
    }

    if (
      action === "deactivate" &&
      !confirm("Deactivate this worker? They will be marked inactive and unavailable.")
    ) {
      return;
    }

    setLoading(action);
    setError(null);
    setSuccess(null);

    const { data, error: patchError, message } = await patchWorkerClient(worker.id, {
      action,
      note: note.trim() || undefined,
    });

    if (patchError) {
      setError(patchError);
    } else {
      if (action === "set_available" || action === "set_unavailable") {
        setSuccess(
          message ??
            (action === "set_available"
              ? "Worker marked available."
              : "Worker marked unavailable."),
        );
      } else {
        setSuccess(message ?? "Worker updated successfully.");
      }
      onUpdated(data ?? undefined);
    }

    setLoading(null);
  }

  return (
    <div className="space-y-4">
      {compact && isActive && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <p>
            <span className="font-semibold text-slate-700">Lifecycle:</span>{" "}
            Active
          </p>
          <p>
            <span className="font-semibold text-slate-700">Availability:</span>{" "}
            {worker.is_available ? "Available" : "Unavailable"}
          </p>
        </div>
      )}

      {!compact && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-700">Verification status</p>
              <p className="mt-1 text-slate-600">
                {isVerified ? "Verified / Approved" : "Pending Verification"}
              </p>
              {isRejected && (
                <p className="mt-1 text-red-700">Application rejected</p>
              )}
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-700">Availability</p>
              <p className="mt-1 text-slate-600">
                {worker.is_available ? "Available" : "Unavailable"}
              </p>
              <p className="mt-1 text-slate-600">Account status: {status}</p>
            </div>
          </div>

          {getRequiredVerificationDocumentLabels().length > 0 &&
            !approvalCheck.ok && (
              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Cannot approve yet</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {approvalCheck.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            )}
        </>
      )}

      {!compact && isActive && (
        <div className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
          This worker is verified and active.
        </div>
      )}

      {!compact && isRejected && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
          This worker application was rejected. Restore for re-review if needed.
        </div>
      )}

      {!compact && isPending && !isRejected && (
        <div className="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">
          This worker is awaiting admin verification. Approve only after reviewing
          documents.
        </div>
      )}

      <div>
        <label
          htmlFor="approval-note"
          className="mb-2 block text-sm font-medium text-slate-600"
        >
          Admin note (optional)
        </label>
        <textarea
          id="approval-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note for approval, rejection, or status changes..."
          className={`w-full rounded-xl border border-slate-300 p-4 outline-none focus:border-blue-700 ${
            compact ? "h-20" : "h-24"
          }`}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {success && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {(isPending || isRejected) && (
          <button
            type="button"
            disabled={loading !== null || !approvalCheck.ok}
            title={
              !approvalCheck.ok ? approvalCheck.blockers.join(" ") : undefined
            }
            onClick={() => handleAction("approve")}
            className="flex-1 rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {loading === "approve" ? "Approving..." : "Approve / Verify Worker"}
          </button>
        )}

        {isPending && !isRejected && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => handleAction("reject")}
            className="flex-1 rounded-xl bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {loading === "reject" ? "Rejecting..." : "Reject Worker"}
          </button>
        )}

        {(isInactive || isRejected) && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => handleAction("restore")}
            className="flex-1 rounded-xl bg-blue-900 px-6 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {loading === "restore" ? "Restoring..." : "Restore for Review"}
          </button>
        )}

        {isInactive && isVerified && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => handleAction("activate")}
            className="flex-1 rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {loading === "activate" ? "Activating..." : "Activate Worker"}
          </button>
        )}

        {isActive && (
          <>
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => handleAction("deactivate")}
              className="flex-1 rounded-xl bg-slate-700 px-6 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading === "deactivate" ? "Deactivating..." : "Deactivate Worker"}
            </button>
            <button
              type="button"
              disabled={loading !== null}
              onClick={() =>
                handleAction(
                  worker.is_available ? "set_unavailable" : "set_available",
                )
              }
              className="flex-1 rounded-xl border border-blue-900 px-6 py-3 font-semibold text-blue-900 hover:bg-blue-50 disabled:opacity-60"
            >
              {loading === "set_available" || loading === "set_unavailable"
                ? "Updating..."
                : worker.is_available
                  ? "Set Unavailable"
                  : "Set Available"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
