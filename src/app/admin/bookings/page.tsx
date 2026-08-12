"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookingListItem } from "@/lib/bookings/queries";
import {
  bookingStatusBadgeClass,
  formatBookingStatus,
  formatCurrency,
  formatDate,
  formatPaymentStatus,
  paymentStatusBadgeClass,
  shortBookingId,
} from "@/lib/bookings/helpers";

export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [paymentFilter, setPaymentFilter] = useState("All Status");

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        bookings?: BookingListItem[];
      };
      if (!res.ok || !json.success) {
        setError(json.message ?? "Failed to load bookings");
        setBookings([]);
      } else {
        setBookings(json.bookings ?? []);
      }
    } catch {
      setError("Failed to load bookings");
      setBookings([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      const matchesStatus =
        statusFilter === "All Status" || b.booking_status === statusFilter;
      const matchesPayment =
        paymentFilter === "All Status" || b.payment_status === paymentFilter;
      const matchesSearch =
        !q ||
        b.id.toLowerCase().includes(q) ||
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_mobile.includes(q) ||
        b.service_type.toLowerCase().includes(q);
      return matchesStatus && matchesPayment && matchesSearch;
    });
  }, [bookings, search, statusFilter, paymentFilter]);

  const stats = useMemo(
    () => ({
      total: bookings.length,
      pending: bookings.filter((b) => b.booking_status === "pending").length,
      inProgress: bookings.filter((b) => b.booking_status === "in_progress")
        .length,
      completed: bookings.filter((b) => b.booking_status === "completed")
        .length,
    }),
    [bookings],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-homigo-primary">
            Bookings Management
          </h1>
          <p className="mt-2 text-slate-500">
            Manage customer bookings, worker assignments and payments.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Total Bookings", value: stats.total, icon: "📋" },
          { title: "Pending", value: stats.pending, icon: "⏳" },
          { title: "In Progress", value: stats.inProgress, icon: "🔧" },
          { title: "Completed", value: stats.completed, icon: "✅" },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border bg-white p-6 shadow-sm"
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

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
          <input
            placeholder="Search booking ID, customer or mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border px-5 py-3 lg:w-96"
          />
          <div className="flex flex-col gap-4 sm:flex-row">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border px-5 py-3"
            >
              <option>All Status</option>
              <option value="pending">pending</option>
              <option value="assigned">assigned</option>
              <option value="in_progress">in_progress</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="rounded-xl border px-5 py-3"
            >
              <option>All Status</option>
              <option value="pending">pending</option>
              <option value="paid">paid</option>
              <option value="failed">failed</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="mt-8 text-center text-slate-500">Loading bookings…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-slate-500">No bookings found.</p>
        ) : (
          <div className="mt-8 hidden overflow-x-auto lg:block">
            <table className="w-full border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-3">Booking ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Worker</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Slot</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((booking) => (
                  <tr key={booking.id} className="bg-slate-50">
                    <td className="px-4 py-5 font-semibold">
                      {shortBookingId(booking.id)}
                    </td>
                    <td className="px-4 py-5">
                      <p className="font-semibold text-homigo-primary">
                        {booking.customer_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {booking.customer_mobile}
                      </p>
                    </td>
                    <td className="px-4 py-5">{booking.service_type}</td>
                    <td className="px-4 py-5">{booking.worker_name}</td>
                    <td className="px-4 py-5">
                      {formatDate(booking.service_date)}
                    </td>
                    <td className="px-4 py-5">
                      {booking.service_time_slot ?? "—"}
                    </td>
                    <td className="px-4 py-5">
                      {formatCurrency(booking.final_amount)}
                    </td>
                    <td className="px-4 py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${paymentStatusBadgeClass(booking.payment_status)}`}
                      >
                        {formatPaymentStatus(booking.payment_status)}
                      </span>
                    </td>
                    <td className="px-4 py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${bookingStatusBadgeClass(booking.booking_status)}`}
                      >
                        {formatBookingStatus(booking.booking_status)}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <Link
                        href={`/admin/bookings/${booking.id}`}
                        className="rounded-lg bg-blue-900 px-4 py-2 text-white"
                      >
                        View Details
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
