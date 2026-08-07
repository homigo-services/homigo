"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApprovalActions } from "@/components/admin/workers/ApprovalActions";
import { DocumentVerificationPanel } from "@/components/admin/workers/DocumentVerificationPanel";
import { VerificationSummary } from "@/components/admin/workers/VerificationSummary";
import { WorkerEditForm } from "@/components/admin/workers/WorkerEditForm";
import { WorkerPhoto } from "@/components/admin/workers/WorkerPhoto";
import { WorkerServicesEditor } from "@/components/admin/workers/WorkerServicesEditor";
import { WorkerServicesList } from "@/components/admin/workers/WorkerServicesList";
import { WorkerStatusDisplay } from "@/components/admin/workers/WorkerStatusBadge";
import { archiveWorkerClient, getWorkerClient } from "@/lib/workers/client-api";
import { getWorkerDocumentSlots } from "@/lib/workers/documents";
import {
  formatDate,
  getWorkerAvailabilityLabel,
  getWorkerDisplayStatus,
  getWorkerName,
  getWorkerServices,
  shouldShowWorkerAvailability,
} from "@/lib/workers/helpers";
import { getVerificationSummary } from "@/lib/workers/verification-rules";
import type { Worker } from "@/lib/workers/types";

export default function WorkerDetailsPage() {
  const params = useParams<{ id: string }>();
  const workerId = params.id;

  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editServices, setEditServices] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchWorker = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);

    const { data, error: fetchError, notFound } = await getWorkerClient(workerId);

    if (notFound || !data) {
      setError(fetchError ?? "Worker not found");
      setWorker(null);
    } else if (fetchError) {
      setError(fetchError);
      setWorker(null);
    } else {
      setWorker(data);
    }

    if (showLoading) setLoading(false);
  }, [workerId]);

  function handleWorkerUpdated(updated?: Worker) {
    if (updated) {
      setWorker(updated);
      return;
    }
    void fetchWorker(false);
  }

  useEffect(() => {
    fetchWorker();
  }, [fetchWorker]);

  const verificationSummary = useMemo(
    () => (worker ? getVerificationSummary(worker) : null),
    [worker],
  );
  const documentSlots = useMemo(
    () => (worker ? getWorkerDocumentSlots(worker) : []),
    [worker],
  );

  async function handleDelete() {
    if (
      !confirm(
        "Delete this worker? They will be archived and hidden from the list.",
      )
    ) {
      return;
    }

    setDeleting(true);
    const { error: deleteError } = await archiveWorkerClient(workerId);
    if (deleteError) {
      setError(deleteError);
      setDeleting(false);
      return;
    }

    window.location.href = "/admin/workers";
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center text-xl font-semibold">
        Loading worker details...
      </div>
    );
  }

  if (error || !worker) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/workers"
          className="inline-block text-sm text-blue-700 hover:underline"
        >
          ← Back to Workers
        </Link>
        <div className="rounded-2xl bg-red-50 p-8 text-center text-red-700">
          {error ?? "Worker not found"}
        </div>
      </div>
    );
  }

  const displayStatus = getWorkerDisplayStatus(worker);
  const services = worker.worker_services ?? [];
  const serviceNames = getWorkerServices(worker);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <WorkerPhoto worker={worker} size="lg" />
            <div>
              <Link
                href="/admin/workers"
                className="mb-2 inline-block text-sm text-blue-700 hover:underline"
              >
                ← Back to Workers
              </Link>

              <h1 className="text-2xl font-bold text-homigo-primary">
                {getWorkerName(worker)}
              </h1>

              <p className="mt-1 text-slate-500">
                Worker Code: {worker.worker_code ?? worker.id.slice(0, 8)}
              </p>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>
                  <span className="font-semibold text-slate-700">Lifecycle:</span>{" "}
                  {displayStatus}
                </p>
                {shouldShowWorkerAvailability(worker) && (
                  <p>
                    <span className="font-semibold text-slate-700">
                      Availability:
                    </span>{" "}
                    {getWorkerAvailabilityLabel(worker)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <WorkerStatusDisplay worker={worker} />
            <button
              type="button"
              onClick={() => setEditMode((value) => !value)}
              className="rounded-xl bg-yellow-400 px-5 py-2 font-semibold hover:bg-yellow-300"
            >
              {editMode ? "Cancel Edit" : "Edit"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="rounded-xl border border-red-300 px-5 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-6">
          <ApprovalActions
            worker={worker}
            onUpdated={handleWorkerUpdated}
            compact
          />
        </div>
      </div>

      {verificationSummary && <VerificationSummary summary={verificationSummary} />}

      {editMode ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-homigo-primary">Edit Worker</h2>
          <div className="mt-4">
            <WorkerEditForm worker={worker} onUpdated={fetchWorker} />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-homigo-primary">
              Personal Details
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              <p>
                Mobile: <b>{worker.mobile_number}</b>
              </p>
              {worker.alternatr_mobile && (
                <p>
                  Alternate Mobile: <b>{worker.alternatr_mobile}</b>
                </p>
              )}
              {worker.gender && (
                <p>
                  Gender: <b>{worker.gender}</b>
                </p>
              )}
              {worker.qualification && (
                <p>
                  Qualification: <b>{worker.qualification}</b>
                </p>
              )}
              {worker.preferred_language && (
                <p>
                  Preferred Language: <b>{worker.preferred_language}</b>
                </p>
              )}
              {worker.preferred_timing && (
                <p>
                  Preferred Timing: <b>{worker.preferred_timing}</b>
                </p>
              )}
              <p>
                Experience: <b>{worker.experience_years ?? 0} years</b>
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-homigo-primary">Location</h2>
            <div className="mt-4 space-y-3 text-sm">
              {worker.address_line && (
                <p>
                  Address: <b>{worker.address_line}</b>
                </p>
              )}
              {worker.area && (
                <p>
                  Area: <b>{worker.area}</b>
                </p>
              )}
              {worker.pincode && (
                <p>
                  Pincode: <b>{worker.pincode}</b>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-homigo-primary">Services</h2>
          <button
            type="button"
            onClick={() => setEditServices((value) => !value)}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            {editServices ? "Done" : "Edit Services"}
          </button>
        </div>
        <div className="mt-4">
          {editServices ? (
            <WorkerServicesEditor
              workerId={worker.id}
              initialServices={serviceNames}
              onUpdated={fetchWorker}
            />
          ) : (
            <WorkerServicesList
              services={services}
              experienceYears={worker.experience_years}
            />
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">
          Documents & Verification
        </h2>
        <div className="mt-4">
          <DocumentVerificationPanel
            workerId={worker.id}
            slots={documentSlots}
            onUpdated={fetchWorker}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-homigo-primary">Admin Note</h2>
          <p className="mt-4 text-sm text-slate-600">
            {worker.note?.trim() || "No admin notes yet."}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-homigo-primary">Activity</h2>
          <div className="mt-4 space-y-3 text-sm">
            <p>Registered: {formatDate(worker.created_at)}</p>
            <p>Last Updated: {formatDate(worker.updated_at)}</p>
            {worker.last_login_at && (
              <p>Last Login: {formatDate(worker.last_login_at)}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
