"use client";

import type { WorkerVerificationSummary } from "@/lib/workers/types";

interface VerificationSummaryProps {
  summary: WorkerVerificationSummary;
}

export function VerificationSummary({ summary }: VerificationSummaryProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-homigo-primary">Verification Summary</h2>
      <p className="mt-1 text-sm text-slate-500">
        Worker verification status:{" "}
        <span className="font-semibold text-slate-700">
          {summary.workerVerificationStatus}
        </span>
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs uppercase text-slate-500">Uploaded</p>
          <p className="mt-1 text-2xl font-bold text-homigo-primary">
            {summary.uploadedCount} / {summary.totalSlots}
          </p>
        </div>
        <div className="rounded-xl bg-green-50 p-4">
          <p className="text-xs uppercase text-green-700">Verified</p>
          <p className="mt-1 text-2xl font-bold text-green-800">
            {summary.verifiedCount} / {summary.totalSlots}
          </p>
        </div>
        <div className="rounded-xl bg-yellow-50 p-4">
          <p className="text-xs uppercase text-yellow-800">Pending Review</p>
          <p className="mt-1 text-2xl font-bold text-yellow-900">
            {summary.pendingCount}
          </p>
        </div>
        <div className="rounded-xl bg-red-50 p-4">
          <p className="text-xs uppercase text-red-700">Rejected</p>
          <p className="mt-1 text-2xl font-bold text-red-800">
            {summary.rejectedCount}
          </p>
        </div>
      </div>

      {summary.missingTypes.length > 0 && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-700">Missing documents (optional)</p>
          <p className="mt-1">{summary.missingTypes.join(", ")}</p>
        </div>
      )}

      {!summary.canApprove && summary.blockers.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Cannot approve worker yet</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {summary.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.canApprove && summary.workerVerificationStatus === "Pending Verification" && (
        <p className="mt-4 text-sm text-green-700">
          Required verification checks passed. Admin can approve this worker.
        </p>
      )}
    </div>
  );
}
