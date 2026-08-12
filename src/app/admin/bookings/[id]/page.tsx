"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BookingDetail } from "@/lib/bookings/queries";
import {
  formatBookingStatus,
  formatCurrency,
  formatDate,
  formatPaymentStatus,
  formatTimeSlot,
  shortBookingId,
} from "@/lib/bookings/helpers";

export default function BookingDetailsPage() {
  const params = useParams();
  const id = String(params.id);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);

  const fetchBooking = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${id}`);
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        booking?: BookingDetail;
      };
      if (!res.ok || !json.success || !json.booking) {
        setError(json.message ?? "Booking not found");
      } else {
        setBooking(json.booking);
        setNotes(json.booking.notes ?? "");
      }
    } catch {
      setError("Failed to load booking");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  async function saveNotes() {
    setSavingNotes(true);
    setNoteMessage(null);
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
      };
      setNoteMessage(
        json.success ? "Notes saved" : (json.message ?? "Failed to save notes"),
      );
    } catch {
      setNoteMessage("Failed to save notes");
    }
    setSavingNotes(false);
  }

  if (loading) {
    return <p className="text-slate-500">Loading booking…</p>;
  }

  if (error || !booking) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{error ?? "Booking not found"}</p>
        <Link href="/admin/bookings" className="text-blue-700 underline">
          Back to bookings
        </Link>
      </div>
    );
  }

  const customer = booking.customer;
  const worker = booking.worker;
  const sr = booking.service_request;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <Link
            href="/admin/bookings"
            className="text-sm text-slate-500 hover:text-homigo-primary"
          >
            ← Back to bookings
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-homigo-primary">
            Booking {shortBookingId(booking.id)}
          </h1>
          <p className="mt-1 text-slate-500">Complete booking information</p>
        </div>
      </div>

      <div className="rounded-2xl bg-blue-50 p-5">
        <p className="text-sm text-slate-500">Booking Status</p>
        <span className="mt-2 inline-block rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
          {formatBookingStatus(booking.booking_status)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-homigo-primary">Customer</h2>
          <div className="mt-4 space-y-3 text-sm">
            <p>
              Name: <b>{customer?.name ?? "—"}</b>
            </p>
            <p>Mobile: {customer?.mobile ?? "—"}</p>
            <p>
              Alternate mobile: {customer?.alternate_mobile ?? "—"}
            </p>
            <p>
              Area / Pincode: {customer?.area ?? "—"}, {customer?.pincode ?? "—"}
            </p>
            <p>Address: {customer?.address_line ?? "—"}</p>
            <p>Landmark: {customer?.landmark ?? "—"}</p>
            {customer && (
              <Link
                href={`/admin/customers/${customer.id}`}
                className="text-blue-700 underline"
              >
                View customer
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-homigo-primary">
            Service Request
          </h2>
          <div className="mt-4 space-y-3 text-sm">
            <p>
              Service: <b>{sr?.service_type ?? "—"}</b>
            </p>
            <p>Issue: {sr?.issue_type ?? "—"}</p>
            <p>Original message: {sr?.original_message ?? "—"}</p>
            <p>Date: {formatDate(sr?.service_date ?? booking.service_date)}</p>
            <p>
              Slot:{" "}
              {sr?.preferred_time_slot ??
                formatTimeSlot(booking.service_time_slot)}
            </p>
            <p>Request status: {sr?.status ?? "—"}</p>
            {sr && (
              <Link
                href={`/admin/service-requests/${sr.id}`}
                className="text-blue-700 underline"
              >
                View service request
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">Worker</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-slate-500">Name</p>
            <b>{worker?.name ?? "Unassigned"}</b>
          </div>
          <div>
            <p className="text-sm text-slate-500">Mobile</p>
            <b>{worker?.mobile ?? "—"}</b>
          </div>
          <div>
            <p className="text-sm text-slate-500">Rating</p>
            <b>{worker ? `⭐ ${worker.rating}` : "—"}</b>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-homigo-primary">
            OTP Verification
          </h2>
          <div className="mt-4 space-y-3 text-sm">
            <p>
              OTP generated:{" "}
              <b>{booking.has_active_otp ? "Yes (active)" : "No"}</b>
            </p>
            <p>
              Verified: <b>{booking.otp_verified ? "Yes" : "No"}</b>
            </p>
            {booking.otp_verified_at && (
              <p>Verified at: {formatDate(booking.otp_verified_at)}</p>
            )}
            {booking.otp_attempts !== undefined && booking.otp_attempts > 0 && (
              <p>Failed attempts: {booking.otp_attempts}</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-homigo-primary">Payment</h2>
          <div className="mt-4 space-y-3 text-sm">
            <p>
              Base amount: <b>{formatCurrency(booking.base_amount)}</b>
            </p>
            <p>Final amount: {formatCurrency(Number(booking.final_amount))}</p>
            <p>
              Platform commission:{" "}
              {formatCurrency(Number(booking.platform_commission))}
            </p>
            <p>
              Lead charge:{" "}
              {formatCurrency(Number(booking.lead_charge ?? 0))}
            </p>
            <p>
              Worker earning:{" "}
              {formatCurrency(Number(booking.worker_earning ?? 0))}
            </p>
            <p>
              Payment status: {formatPaymentStatus(booking.payment_status)}
            </p>
            <p>Payment mode: {booking.Payment_mode ?? "—"}</p>
            {booking.payment_received_at && (
              <p>Received at: {formatDate(booking.payment_received_at)}</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">Booking Meta</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd>{formatDate(booking.created_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Updated</dt>
            <dd>{formatDate(booking.updated_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Cancellation reason</dt>
            <dd>{booking.cancel_reason ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Worker rating</dt>
            <dd>{booking.worker_rating ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">Admin Notes</h2>
        <textarea
          placeholder="Add internal notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-4 h-28 w-full rounded-xl border p-4 outline-none"
        />
        {noteMessage && (
          <p className="mt-2 text-sm text-slate-600">{noteMessage}</p>
        )}
        <button
          type="button"
          onClick={saveNotes}
          disabled={savingNotes}
          className="mt-3 rounded-xl bg-blue-900 px-5 py-2 text-white disabled:opacity-50"
        >
          {savingNotes ? "Saving…" : "Save Notes"}
        </button>
      </div>
    </div>
  );
}
