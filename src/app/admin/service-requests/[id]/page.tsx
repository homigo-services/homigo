"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatDate } from "@/lib/bookings/helpers";
import type { ServiceRequestWithCustomer } from "@/lib/service-requests/queries";
import type { ServiceRequestMatchingSummary } from "@/lib/service-requests/matching-summary";

type DetailResponse = ServiceRequestWithCustomer & {
  matching?: ServiceRequestMatchingSummary;
};

export default function ServiceRequestDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [request, setRequest] = useState<DetailResponse | null>(null);
  const [matching, setMatching] = useState<ServiceRequestMatchingSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/service-requests/${id}`);
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        service_request?: DetailResponse;
        matching?: ServiceRequestMatchingSummary;
      };
      if (!res.ok || !json.success || !json.service_request) {
        setError(json.message ?? "Service request not found");
      } else {
        setRequest(json.service_request);
        setMatching(json.matching ?? json.service_request?.matching ?? null);
      }
    } catch {
      setError("Failed to load service request");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchRequest();
  }, [fetchRequest]);

  if (loading) {
    return <p className="text-slate-500">Loading service request…</p>;
  }

  if (error || !request) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{error ?? "Not found"}</p>
        <Link href="/admin/service-requests" className="text-blue-700 underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/service-requests"
          className="text-sm text-slate-500 hover:text-homigo-primary"
        >
          ← Back to service requests
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-homigo-primary">
          Service Request
        </h1>
        <p className="text-sm text-slate-500">
          ID: {request.id.slice(0, 8).toUpperCase()}
        </p>
      </div>

      <div className="rounded-2xl bg-blue-50 p-5">
        <p className="text-sm text-slate-500">Status</p>
        <span className="mt-2 inline-block rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
          {request.status}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-homigo-primary">Customer</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium">{request.customer?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Mobile</dt>
              <dd>
                {request.customer_mobile ?? request.customer?.mobile ?? "—"}
              </dd>
            </div>
            {request.customer && (
              <div>
                <Link
                  href={`/admin/customers/${request.customer_id}`}
                  className="text-blue-700 underline"
                >
                  View customer profile
                </Link>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-homigo-primary">Service</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">Service</dt>
              <dd className="font-medium">{request.service_type}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Issue</dt>
              <dd>{request.issue_type ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Date / Slot</dt>
              <dd>
                {formatDate(request.service_date)} · {request.preferred_time_slot}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">Location</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-slate-500">Area / Pincode</dt>
            <dd>
              {request.area}, {request.pincode}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Address</dt>
            <dd>{request.address ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">
          Original Message
        </h2>
        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
          {request.original_message}
        </p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">Worker matching</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-slate-500">Matching status (batch 1)</dt>
            <dd>{matching?.matching_status ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Offers / pending</dt>
            <dd>
              {matching?.offer_count ?? 0} / {matching?.pending_offers ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Offer expiry</dt>
            <dd>{matching?.offer_expires_at ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Accepted worker</dt>
            <dd>{matching?.accepted_worker_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Booking ID</dt>
            <dd className="font-mono text-xs">{matching?.booking_id ?? "—"}</dd>
          </div>
        </dl>
        {matching?.offers && matching.offers.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-slate-600">
            {matching.offers.map((o) => (
              <li key={o.id}>
                {o.worker_name} · {o.status} · batch {o.batch_number}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">Rate Card</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-slate-500">Rate card sent</dt>
            <dd>{request.rate_card_sent ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Rate card accepted</dt>
            <dd>{request.rate_card_accepted ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd>{formatDate(request.created_at)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
