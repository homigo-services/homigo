"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatCustomerStatus,
  matchesCustomerSearch,
  shortCustomerId,
} from "@/lib/customers/helpers";
import type { CustomerWithStats } from "@/lib/customers/queries";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customers?withStats=true");
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        customers?: CustomerWithStats[];
      };
      if (!res.ok || !json.success) {
        setError(json.message ?? "Failed to load customers");
        setCustomers([]);
      } else {
        setCustomers(json.customers ?? []);
      }
    } catch {
      setError("Failed to load customers");
      setCustomers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch = matchesCustomerSearch(c, search);
      const matchesStatus =
        statusFilter === "All Status" ||
        c.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: customers.length,
      active: customers.filter((c) => c.status === "active").length,
      verified: customers.filter((c) => c.is_whatsapp_verified).length,
      bookings: customers.reduce((sum, c) => sum + c.booking_count, 0),
    };
  }, [customers]);

  const statCards = [
    { title: "Total Customers", value: String(stats.total), icon: "👥" },
    { title: "Active Customers", value: String(stats.active), icon: "✅" },
    { title: "WhatsApp Verified", value: String(stats.verified), icon: "📱" },
    { title: "Total Bookings", value: String(stats.bookings), icon: "📋" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-homigo-primary">
            Customers Management
          </h1>
          <p className="mt-2 text-slate-500">
            Manage Homigo customer information and service history.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
          >
            <div className="flex justify-between">
              <p className="text-sm text-slate-500">{item.title}</p>
              <span className="text-2xl">{item.icon}</span>
            </div>
            <h2 className="mt-4 text-3xl font-bold text-homigo-primary">
              {loading ? "…" : item.value}
            </h2>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
          <input
            placeholder="Search customer name or mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-3 outline-none focus:border-blue-700 lg:w-96"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-5 py-3"
          >
            <option>All Status</option>
            <option>active</option>
            <option>inactive</option>
          </select>
        </div>

        {loading ? (
          <p className="mt-8 text-center text-slate-500">Loading customers…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-slate-500">No customers found.</p>
        ) : (
          <div className="mt-8 hidden overflow-x-auto lg:block">
            <table className="w-full border-separate border-spacing-y-3">
              <thead>
                <tr className="text-left text-sm text-slate-500">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Bookings</th>
                  <th className="px-4 py-3">Last Service</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id} className="bg-slate-50 text-sm">
                    <td className="px-4 py-5 font-semibold">
                      {shortCustomerId(customer.id)}
                    </td>
                    <td className="px-4 py-5">
                      <p className="font-semibold text-homigo-primary">
                        {customer.name}
                      </p>
                    </td>
                    <td className="px-4 py-5">{customer.mobile}</td>
                    <td className="px-4 py-5">{customer.area}</td>
                    <td className="px-4 py-5">{customer.booking_count}</td>
                    <td className="px-4 py-5">
                      {customer.last_service ?? "—"}
                    </td>
                    <td className="px-4 py-5">
                      <span
                        className={`rounded-full px-4 py-2 text-xs font-semibold ${
                          customer.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {formatCustomerStatus(customer.status)}
                      </span>
                    </td>
                    <td className="px-4 py-5">
                      {customer.is_whatsapp_verified ? (
                        <span className="text-green-600">Verified</span>
                      ) : (
                        <span className="text-slate-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex justify-center gap-3">
                        <Link
                          href={`/admin/customers/${customer.id}`}
                          className="rounded-lg bg-blue-900 px-4 py-2 text-white"
                        >
                          View
                        </Link>
                        <Link
                          href={`/admin/customers/${customer.id}?edit=1`}
                          className="rounded-lg bg-yellow-400 px-4 py-2 font-semibold"
                        >
                          Edit
                        </Link>
                      </div>
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
