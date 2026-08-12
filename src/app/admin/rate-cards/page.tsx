"use client";

import { useCallback, useEffect, useState } from "react";
import { calculateBookingAmounts } from "@/lib/rate-cards/calculator";
import type { ServiceRateCardWithService } from "@/lib/rate-cards/types";
import { fetchServiceCatalog } from "@/lib/workers/service-resolver";
import { supabase } from "@/lib/supabase";

interface ServiceOption {
  id: string;
  name: string;
}

export default function RateCardsPage() {
  const [rateCards, setRateCards] = useState<ServiceRateCardWithService[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    service_id: "",
    base_amount: "",
    lead_charge: "0",
    platform_commission: "0",
    is_active: true,
    effective_from: "",
    effective_to: "",
    notes: "",
  });

  const fetchRateCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rate-cards");
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        rate_cards?: ServiceRateCardWithService[];
      };
      if (!res.ok || !json.success) {
        setError(json.message ?? "Failed to load rate cards");
        setRateCards([]);
      } else {
        setRateCards(json.rate_cards ?? []);
      }
    } catch {
      setError("Failed to load rate cards");
      setRateCards([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRateCards();
    fetchServiceCatalog(supabase).then(({ data }) => {
      setServices(data.map((s) => ({ id: s.id, name: s.name })));
    });
  }, [fetchRateCards]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.service_id) {
      setMessage("Select a service");
      return;
    }

    setSaving(true);
    setMessage(null);

    const base = Number.parseFloat(form.base_amount) || 0;
    const lead = Number.parseFloat(form.lead_charge) || 0;
    const platform = Number.parseFloat(form.platform_commission) || 0;
    const amounts = calculateBookingAmounts({
      base_amount: base,
      lead_charge: lead,
      platform_commission: platform,
      worker_earning: 0,
    });

    try {
      const res = await fetch("/api/rate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: form.service_id,
          base_amount: base,
          lead_charge: lead,
          platform_commission: platform,
          worker_earning: amounts.worker_earning,
          is_active: form.is_active,
          effective_from: form.effective_from || undefined,
          effective_to: form.effective_to || null,
          notes: form.notes || null,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
      };
      if (!res.ok || !json.success) {
        setMessage(json.message ?? "Failed to create rate card");
      } else {
        setMessage("Rate card created");
        setForm({
          service_id: "",
          base_amount: "",
          lead_charge: "0",
          platform_commission: "0",
          is_active: true,
          effective_from: "",
          effective_to: "",
          notes: "",
        });
        fetchRateCards();
      }
    } catch {
      setMessage("Failed to create rate card");
    }
    setSaving(false);
  }

  async function toggleActive(card: ServiceRateCardWithService) {
    const res = await fetch(`/api/rate-cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !card.is_active }),
    });
    if (res.ok) fetchRateCards();
  }

  const preview =
    form.service_id && form.base_amount
      ? calculateBookingAmounts({
          base_amount: Number.parseFloat(form.base_amount) || 0,
          lead_charge: Number.parseFloat(form.lead_charge) || 0,
          platform_commission: Number.parseFloat(form.platform_commission) || 0,
          worker_earning: 0,
        })
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-homigo-primary">Rate Cards</h1>
        <p className="mt-2 text-slate-500">
          Configure service pricing from the database catalog.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-bold text-homigo-primary">
          Add Rate Card
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-sm text-slate-500">Service</label>
            <select
              className="mt-1 w-full rounded-xl border px-4 py-2"
              value={form.service_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, service_id: e.target.value }))
              }
              required
            >
              <option value="">Select service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-500">Base amount (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-xl border px-4 py-2"
              value={form.base_amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, base_amount: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-500">Lead charge (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-xl border px-4 py-2"
              value={form.lead_charge}
              onChange={(e) =>
                setForm((f) => ({ ...f, lead_charge: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-sm text-slate-500">
              Platform commission (₹)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-xl border px-4 py-2"
              value={form.platform_commission}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  platform_commission: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <label className="text-sm text-slate-500">Effective from</label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border px-4 py-2"
              value={form.effective_from}
              onChange={(e) =>
                setForm((f) => ({ ...f, effective_from: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-sm text-slate-500">Effective to</label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border px-4 py-2"
              value={form.effective_to}
              onChange={(e) =>
                setForm((f) => ({ ...f, effective_to: e.target.value }))
              }
            />
          </div>
        </div>

        {preview && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
            <p>
              Final amount (customer): ₹{preview.final_amount.toFixed(2)}
            </p>
            <p>Worker earning: ₹{preview.worker_earning.toFixed(2)}</p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="is-active"
            checked={form.is_active}
            onChange={(e) =>
              setForm((f) => ({ ...f, is_active: e.target.checked }))
            }
          />
          <label htmlFor="is-active">Active</label>
        </div>

        {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-xl bg-blue-900 px-6 py-3 text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create Rate Card"}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">
          Existing Rate Cards
        </h2>
        {loading ? (
          <p className="mt-4 text-slate-500">Loading…</p>
        ) : rateCards.length === 0 ? (
          <p className="mt-4 text-slate-500">No rate cards configured yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">Service</th>
                  <th className="py-2">Base</th>
                  <th className="py-2">Lead</th>
                  <th className="py-2">Commission</th>
                  <th className="py-2">Worker earning</th>
                  <th className="py-2">Active</th>
                  <th className="py-2">Effective</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rateCards.map((card) => (
                  <tr key={card.id} className="border-t">
                    <td className="py-2">{card.service_name}</td>
                    <td className="py-2">₹{card.base_amount}</td>
                    <td className="py-2">₹{card.lead_charge}</td>
                    <td className="py-2">₹{card.platform_commission}</td>
                    <td className="py-2">₹{card.worker_earning}</td>
                    <td className="py-2">{card.is_active ? "Yes" : "No"}</td>
                    <td className="py-2">
                      {new Date(card.effective_from).toLocaleDateString("en-IN")}
                      {card.effective_to
                        ? ` → ${new Date(card.effective_to).toLocaleDateString("en-IN")}`
                        : ""}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(card)}
                        className="rounded-lg border px-3 py-1 text-xs"
                      >
                        {card.is_active ? "Deactivate" : "Activate"}
                      </button>
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
