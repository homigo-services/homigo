"use client";

import { useCallback, useEffect, useState } from "react";

type Booking = {
  id: string;
  booking_status: string;
  payment_status: string;
  service_type: string | null;
  area: string | null;
  service_date: string | null;
  time_slot: string | null;
  final_amount: number | null;
  worker_earning: number | null;
  otp_verified: boolean;
  otp_pending: boolean;
  payment_mode: string | null;
  can_request_otp: boolean;
  can_verify_otp: boolean;
  can_confirm_cash: boolean;
};

export default function WorkerBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/worker/bookings", { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/worker/login";
      return;
    }
    const data = (await res.json()) as { ok?: boolean; bookings?: Booking[] };
    setLoading(false);
    setBookings(data.bookings ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(bookingId: string, path: string, body?: object) {
    setBusyId(bookingId);
    setActionError(null);
    const res = await fetch(`/api/worker/bookings/${bookingId}/${path}`, {
      method: "POST",
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setBusyId(null);
    if (!res.ok) {
      setActionError(json.message ?? json.error ?? "Action failed");
      return;
    }
    await load();
  }

  if (loading) {
    return <p className="text-zinc-600">Loading bookings…</p>;
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-zinc-600">
        No bookings yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">My bookings</h2>
      {actionError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}
      {bookings.map((b) => (
        <article
          key={b.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <p className="font-semibold">{b.service_type ?? "Service"}</p>
          <p className="text-sm text-zinc-600">{b.area ?? "—"}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-zinc-500">Date</dt>
              <dd>{b.service_date ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Time</dt>
              <dd>{b.time_slot ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Status</dt>
              <dd className="capitalize">{b.booking_status ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Payment</dt>
              <dd className="capitalize">{b.payment_status ?? "—"}</dd>
            </div>
            {b.worker_earning != null && (
              <div className="col-span-2">
                <dt className="text-zinc-500">Earning</dt>
                <dd className="font-medium text-emerald-700">₹{Math.round(b.worker_earning)}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
            {b.can_request_otp && (
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => void runAction(b.id, "request-completion-otp")}
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Request completion OTP
              </button>
            )}
            {b.can_verify_otp && (
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit OTP from customer"
                  value={otpInputs[b.id] ?? ""}
                  onChange={(e) =>
                    setOtpInputs((prev) => ({ ...prev, [b.id]: e.target.value }))
                  }
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busyId === b.id || (otpInputs[b.id]?.length ?? 0) !== 6}
                  onClick={() =>
                    void runAction(b.id, "verify-completion-otp", { otp: otpInputs[b.id] })
                  }
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Verify
                </button>
              </div>
            )}
            {b.can_confirm_cash && (
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => void runAction(b.id, "confirm-cash")}
                className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirm cash received (₹1000)
              </button>
            )}
            {b.otp_verified && !b.can_confirm_cash && b.payment_status === "pending" && (
              <p className="text-xs text-zinc-500">
                Waiting for customer to select payment on WhatsApp.
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
