"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImportWorkerModal } from "@/components/admin/workers/ImportWorkerModal";
import { WorkerStatusDisplay } from "@/components/admin/workers/WorkerStatusBadge";
import { WorkerPhoto } from "@/components/admin/workers/WorkerPhoto";
import { supabase } from "@/lib/supabase";
import { getWorkersClient } from "@/lib/workers/client-api";
import {
  formatServicesLabel,
  getWorkerDisplayStatus,
  getWorkerName,
  getWorkerServices,
  matchesServiceFilter,
  matchesWorkerSearch,
} from "@/lib/workers/helpers";
import { countWorkersByDisplayStatus, getWorkerStats } from "@/lib/workers/status";
import { fetchServiceCatalog } from "@/lib/workers/service-resolver";
import type { Worker } from "@/lib/workers/types";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("All Services");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [importToast, setImportToast] = useState<string | null>(null);

  const fetchWorkers = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setFetchError(null);

    const { data, error } = await getWorkersClient();

    if (error) {
      console.error(error);
      setFetchError(error);
      setWorkers([]);
    } else {
      setWorkers(data ?? []);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  useEffect(() => {
    fetchServiceCatalog(supabase).then(({ data }) => {
      if (data.length > 0) {
        setServiceOptions(data.map((s) => s.name));
      }
    });
  }, []);

  const filteredWorkers = useMemo(() => {
    return workers.filter((worker) => {
      const matchesSearch = matchesWorkerSearch(worker, search);
      const matchesService = matchesServiceFilter(worker, serviceFilter);
      const displayStatus = getWorkerDisplayStatus(worker);
      const matchesStatus =
        statusFilter === "All Status" || displayStatus === statusFilter;

      return matchesSearch && matchesService && matchesStatus;
    });
  }, [workers, search, serviceFilter, statusFilter]);

  const statsData = useMemo(() => getWorkerStats(workers), [workers]);

  const stats = [
    { title: "Total Workers", value: statsData.total, icon: "👷" },
    { title: "Active Workers", value: statsData.active, icon: "✅" },
    { title: "Pending Verification", value: statsData.pending, icon: "⏳" },
    { title: "Inactive Workers", value: statsData.inactive, icon: "⚠️" },
    { title: "Rejected", value: statsData.rejected, icon: "⛔" },
  ];

  const statusOptions = [
    "All Status",
    "Pending",
    "Active",
    "Inactive",
    "Rejected",
  ] as const;

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center text-xl font-semibold">
        Loading Workers...
      </div>
    );
  }

  return (
    <>
      <ImportWorkerModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(result) => {
          fetchWorkers(true);
          setImportToast(
            `Worker imported successfully. ${result.workerName} (${result.workerCode}) — ${result.servicesCount} service(s), ${result.documentsCount} document(s). Verification: ${result.verificationStatus}.`,
          );
        }}
      />

      <div className="space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-homigo-primary">
              Workers Management
            </h1>

            <p className="mt-2 text-slate-500">
              Manage Homigo service professionals
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => fetchWorkers(true)}
              disabled={refreshing}
              className="rounded-xl border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white shadow transition hover:bg-green-700"
            >
              Import Worker
            </button>
          </div>
        </div>

        {fetchError && (
          <div className="rounded-xl bg-red-50 px-5 py-4 text-sm text-red-700">
            Failed to load workers: {fetchError}.{" "}
            <button
              type="button"
              onClick={() => fetchWorkers(true)}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {importToast && (
          <div className="rounded-xl bg-green-50 px-5 py-4 text-sm text-green-800">
            {importToast}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {statusOptions.map((status) => {
            const count =
              status === "All Status"
                ? workers.length
                : countWorkersByDisplayStatus(workers, status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  statusFilter === status
                    ? "bg-blue-900 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200"
                }`}
              >
                {status} ({count})
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{item.title}</p>
                <span className="text-2xl">{item.icon}</span>
              </div>

              <h2 className="mt-4 text-3xl font-bold text-homigo-primary">
                {item.value}
              </h2>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <input
              type="text"
              placeholder="Search name, mobile, or worker code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-5 py-3 outline-none focus:border-blue-700 lg:w-96"
            />

            <div className="flex flex-col gap-4 sm:flex-row">
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-5 py-3"
              >
                <option>All Services</option>
                {serviceOptions.map((service) => (
                  <option key={service}>{service}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-5 py-3"
              >
                <option>All Status</option>
                <option>Active</option>
                <option>Inactive</option>
                <option>Pending</option>
                <option>Rejected</option>
              </select>
            </div>
          </div>

          <div className="mt-8 hidden overflow-x-auto lg:block">
            <table className="w-full border-separate border-spacing-y-3">
              <thead>
                <tr className="text-left text-sm text-slate-500">
                  <th className="px-4 py-3">Photo</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Services</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Worker Code</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredWorkers.map((worker) => {
                  const services = getWorkerServices(worker);

                  return (
                    <tr
                      key={worker.id}
                      className="rounded-xl bg-slate-50 text-sm shadow-sm"
                    >
                      <td className="rounded-l-xl px-4 py-5">
                        <WorkerPhoto worker={worker} size="sm" />
                      </td>

                      <td className="px-4 py-5 font-semibold text-homigo-primary">
                        {getWorkerName(worker)}
                      </td>

                      <td className="px-4 py-5">{worker.mobile_number}</td>

                      <td className="px-4 py-5">{worker.area ?? "—"}</td>

                      <td className="px-4 py-5">
                        {formatServicesLabel(services)}
                      </td>

                      <td className="px-4 py-5">
                        <WorkerStatusDisplay worker={worker} />
                      </td>

                      <td className="px-4 py-5">⭐ {worker.rating ?? 0}</td>

                      <td className="px-4 py-5 font-semibold">
                        {worker.worker_code ?? worker.id.slice(0, 8)}
                      </td>

                      <td className="rounded-r-xl px-4 py-5">
                        <div className="flex justify-center">
                          <Link
                            href={`/admin/workers/${worker.id}`}
                            className="rounded-lg bg-blue-900 px-4 py-2 text-white hover:bg-blue-800"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredWorkers.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-8 text-center text-slate-500"
                    >
                      No workers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-8 space-y-4 lg:hidden">
            {filteredWorkers.map((worker) => {
              const services = getWorkerServices(worker);

              return (
                <div
                  key={worker.id}
                  className="rounded-2xl border bg-slate-50 p-5 shadow-sm"
                >
                  <div className="flex justify-between gap-3">
                    <div className="flex gap-3">
                      <WorkerPhoto worker={worker} size="md" />
                      <div>
                        <h3 className="font-bold text-homigo-primary">
                          {getWorkerName(worker)}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {formatServicesLabel(services)}
                        </p>
                      </div>
                    </div>

                    <WorkerStatusDisplay worker={worker} />
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <p>📞 {worker.mobile_number}</p>
                    <p>📍 {worker.area ?? "—"}</p>
                    <p>⭐ {worker.rating ?? 0}</p>
                    <p>
                      Code: {worker.worker_code ?? worker.id.slice(0, 8)}
                    </p>
                  </div>

                  <div className="mt-5">
                    <Link
                      href={`/admin/workers/${worker.id}`}
                      className="block rounded-lg bg-blue-900 py-2 text-center text-white"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              );
            })}

            {filteredWorkers.length === 0 && (
              <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow">
                No Workers Found
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
