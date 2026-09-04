"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Offer = {
  id: string;
  status: string;
  expires_at: string;
  service_type: string | null;
  area: string | null;
  service_date: string | null;
  preferred_time_slot: string | null;
  estimated_earning: number | null;
  is_expired: boolean;
};

export default function WorkerOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/worker/offers", { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/worker/login";
      return;
    }
    const data = (await res.json()) as { ok?: boolean; offers?: Offer[]; error?: string };
    setLoading(false);
    if (!data.ok) {
      setError(data.error ?? "Failed to load offers");
      return;
    }
    setOffers(data.offers ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function acceptOffer(id: string) {
    setActionId(id);
    const res = await fetch(`/api/worker/offers/${id}`, {
      method: "POST",
      credentials: "include",
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    setActionId(null);
    if (!data.ok) {
      alert(data.message ?? data.error ?? "Could not accept");
    }
    await load();
  }

  async function rejectOffer(id: string) {
    setActionId(id);
    const res = await fetch(`/api/worker/offers/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setActionId(null);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error ?? "Could not reject");
    }
    await load();
  }

  if (loading) {
    return <p className="text-zinc-600">Loading offers…</p>;
  }

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  if (offers.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center">
        <p className="text-zinc-600">No service requests right now.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 text-sm font-medium text-emerald-700"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Service requests</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-emerald-700"
        >
          Refresh
        </button>
      </div>

      {offers.map((offer) => {
        const pending = offer.status === "pending" && !offer.is_expired;
        const statusLabel =
          offer.status === "pending" && offer.is_expired
            ? "expired"
            : offer.status;

        return (
          <article
            key={offer.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-zinc-900">
                  {offer.service_type ?? "Service"}
                </p>
                <p className="text-sm text-zinc-600">{offer.area ?? "—"}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  statusLabel === "pending"
                    ? "bg-amber-100 text-amber-800"
                    : statusLabel === "accepted"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {statusLabel}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-zinc-500">Date</dt>
                <dd>{offer.service_date ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Time</dt>
                <dd>{offer.preferred_time_slot ?? "—"}</dd>
              </div>
              {offer.estimated_earning != null && (
                <div className="col-span-2">
                  <dt className="text-zinc-500">Est. earning</dt>
                  <dd className="font-medium text-emerald-700">
                    ₹{Math.round(offer.estimated_earning)}
                  </dd>
                </div>
              )}
              {pending && (
                <div className="col-span-2">
                  <dt className="text-zinc-500">Expires</dt>
                  <dd>{new Date(offer.expires_at).toLocaleString("en-IN")}</dd>
                </div>
              )}
            </dl>

            {pending && (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={actionId === offer.id}
                  onClick={() => void acceptOffer(offer.id)}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={actionId === offer.id}
                  onClick={() => void rejectOffer(offer.id)}
                  className="flex-1 rounded-lg border border-zinc-300 py-2 text-sm font-medium text-zinc-700 disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            )}
          </article>
        );
      })}

      <p className="text-center text-xs text-zinc-500">
        Not logged in? <Link href="/worker/login">Login</Link>
      </p>
    </div>
  );
}
