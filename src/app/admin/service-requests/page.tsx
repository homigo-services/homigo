"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/bookings/helpers";
import type { ServiceRequestWithCustomer } from "@/lib/service-requests/queries";
import type { ServiceRequestMatchingSummary } from "@/lib/service-requests/matching-summary";

type ServiceRequestRow = ServiceRequestWithCustomer & {
  matching?: ServiceRequestMatchingSummary;
};

export default function ServiceRequestsPage() {
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/service-requests");
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        service_requests?: ServiceRequestRow[];
      };
      if (!res.ok || !json.success) {
        setError(json.message ?? "Failed to load service requests");
        setRequests([]);
      } else {
        setRequests(json.service_requests ?? []);
      }
    } catch {
      setError("Failed to load service requests");
      setRequests([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      const matchesStatus =
        statusFilter === "All Status" || r.status === statusFilter;
      const matchesSearch =
        !q ||
        r.service_type.toLowerCase().includes(q) ||
        (r.customer?.name?.toLowerCase().includes(q) ?? false) ||
        (r.customer_mobile?.includes(q) ?? false) ||
        r.area.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [requests, search, statusFilter]);

  const stats = useMemo(
    () => ({
      total: requests.length,
      newCount: requests.filter((r) => r.status === "new").length,
      ratePending: requests.filter((r) => !r.rate_card_accepted).length,
    }),
    [requests],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-homigo-primary">
          Service Requests
        </h1>
        <p className="mt-2 text-slate-500">
          Customer service requests and rate-card status.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {[
          { title: "Total Requests", value: stats.total },
          { title: "New", value: stats.newCount },
          { title: "Rate Card Pending", value: stats.ratePending },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
          >
            <p className="text-sm text-slate-500">{item.title}</p>
            <h2 className="mt-4 text-3xl font-bold text-homigo-primary">
              {loading ? "…" : item.value}
            </h2>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
          <input
            placeholder="Search service, customer, mobile, area..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-3 outline-none lg:w-96"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-5 py-3"
          >
            <option>All Status</option>
            <option>new</option>
          </select>
        </div>

        {loading ? (
          <p className="mt-8 text-center text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-slate-500">
            No service requests found.
          </p>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-3">Request ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Pincode</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Slot</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Rate Sent</th>
                  <th className="px-4 py-3">Rate Accepted</th>
                  <th className="px-4 py-3">Matching</th>
                  <th className="px-4 py-3">Offers</th>
                  <th className="px-4 py-3">Worker</th>
                  <th className="px-4 py-3">Booking</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="bg-slate-50">
                    <td className="px-4 py-4 font-semibold">
                      {r.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-4">{r.customer?.name ?? "—"}</td>
                    <td className="px-4 py-4">
                      {r.customer_mobile ?? r.customer?.mobile ?? "—"}
                    </td>
                    <td className="px-4 py-4">{r.service_type}</td>
                    <td className="px-4 py-4">{r.area}</td>
                    <td className="px-4 py-4">{r.pincode}</td>
                    <td className="px-4 py-4">{formatDate(r.service_date)}</td>
                    <td className="px-4 py-4">{r.preferred_time_slot}</td>
                    <td className="px-4 py-4">{r.status}</td>
                    <td className="px-4 py-4">
                      {r.rate_card_sent ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-4">
                      {r.rate_card_accepted ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-4">{r.matching?.matching_status ?? "—"}</td>
                    <td className="px-4 py-4">{r.matching?.offer_count ?? 0}</td>
                    <td className="px-4 py-4">
                      {r.matching?.accepted_worker_name ?? "—"}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">
                      {r.matching?.booking_id?.slice(0, 8).toUpperCase() ?? "—"}
                    </td>
                    <td className="px-4 py-4">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/service-requests/${r.id}`}
                        className="rounded-lg bg-blue-900 px-4 py-2 text-white"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
