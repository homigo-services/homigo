"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BookingListItem } from "@/lib/bookings/queries";
import {
  formatBookingStatus,
  formatCurrency,
  formatDate,
  shortBookingId,
} from "@/lib/bookings/helpers";
import {
  formatCustomerStatus,
  formatLanguage,
  shortCustomerId,
} from "@/lib/customers/helpers";
import type { Customer } from "@/lib/customers/types";
import type { ServiceRequestWithCustomer } from "@/lib/service-requests/queries";

export default function CustomerDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id);
  const editMode = searchParams.get("edit") === "1";

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [serviceRequests, setServiceRequests] = useState<
    ServiceRequestWithCustomer[]
  >([]);
  const [bookingCount, setBookingCount] = useState(0);
  const [lastService, setLastService] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(editMode);

  const [form, setForm] = useState({
    name: "",
    mobile: "",
    alternate_mobile: "",
    area: "",
    pincode: "",
    address_line: "",
    landmark: "",
    preferred_language: "mr",
    status: "active",
    is_whatsapp_verified: false,
    notes: "",
  });

  const fetchCustomer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${id}`);
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        customer?: Customer;
        bookings?: BookingListItem[];
        service_requests?: ServiceRequestWithCustomer[];
        booking_count?: number;
        last_service?: string | null;
      };

      if (!res.ok || !json.success || !json.customer) {
        setError(json.message ?? "Customer not found");
        return;
      }

      setCustomer(json.customer);
      setBookings(json.bookings ?? []);
      setServiceRequests(json.service_requests ?? []);
      setBookingCount(json.booking_count ?? 0);
      setLastService(json.last_service ?? null);
      setForm({
        name: json.customer.name,
        mobile: json.customer.mobile,
        alternate_mobile: json.customer.alternate_mobile ?? "",
        area: json.customer.area,
        pincode: json.customer.pincode,
        address_line: json.customer.address_line,
        landmark: json.customer.landmark ?? "",
        preferred_language: json.customer.preferred_language,
        status: json.customer.status,
        is_whatsapp_verified: json.customer.is_whatsapp_verified,
        notes: json.customer.notes ?? "",
      });
    } catch {
      setError("Failed to load customer");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  useEffect(() => {
    setEditing(editMode);
  }, [editMode]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          mobile: form.mobile,
          alternate_mobile: form.alternate_mobile || null,
          area: form.area,
          pincode: form.pincode,
          address_line: form.address_line,
          landmark: form.landmark || null,
          preferred_language: form.preferred_language,
          status: form.status,
          is_whatsapp_verified: form.is_whatsapp_verified,
          notes: form.notes || null,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        customer?: Customer;
      };
      if (!res.ok || !json.success) {
        setSaveMessage(json.message ?? "Update failed");
      } else {
        setSaveMessage("Customer updated successfully");
        setEditing(false);
        if (json.customer) setCustomer(json.customer);
      }
    } catch {
      setSaveMessage("Update failed");
    }
    setSaving(false);
  }

  if (loading) {
    return <p className="text-slate-500">Loading customer…</p>;
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{error ?? "Customer not found"}</p>
        <Link href="/admin/customers" className="text-blue-700 underline">
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Link
            href="/admin/customers"
            className="text-sm text-slate-500 hover:text-homigo-primary"
          >
            ← Back to customers
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-homigo-primary">
            {customer.name}
          </h1>
          <p className="text-sm text-slate-500">
            ID: {shortCustomerId(customer.id)}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-xl bg-yellow-400 px-5 py-3 font-semibold"
          >
            Edit Customer
          </button>
        )}
      </div>

      {saveMessage && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {saveMessage}
        </div>
      )}

      {editing ? (
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-2xl bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-bold text-homigo-primary">Edit Customer</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["name", "Name"],
                ["mobile", "Mobile"],
                ["alternate_mobile", "Alternate Mobile"],
                ["area", "Area"],
                ["pincode", "Pincode"],
                ["address_line", "Address"],
                ["landmark", "Landmark"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="text-sm text-slate-500">{label}</label>
                <input
                  className="mt-1 w-full rounded-xl border px-4 py-2"
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div>
              <label className="text-sm text-slate-500">Preferred Language</label>
              <select
                className="mt-1 w-full rounded-xl border px-4 py-2"
                value={form.preferred_language}
                onChange={(e) =>
                  setForm((f) => ({ ...f, preferred_language: e.target.value }))
                }
              >
                <option value="mr">मराठी</option>
                <option value="hi">हिंदी</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-500">Status</label>
              <select
                className="mt-1 w-full rounded-xl border px-4 py-2"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="wa-verified"
                checked={form.is_whatsapp_verified}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    is_whatsapp_verified: e.target.checked,
                  }))
                }
              />
              <label htmlFor="wa-verified">WhatsApp Verified</label>
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-500">Notes</label>
            <textarea
              className="mt-1 w-full rounded-xl border px-4 py-2"
              rows={3}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-900 px-5 py-3 text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl border px-5 py-3"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-homigo-primary">Details</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Mobile</dt>
                <dd className="font-medium">{customer.mobile}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Alternate Mobile</dt>
                <dd>{customer.alternate_mobile ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Area / Pincode</dt>
                <dd>
                  {customer.area}, {customer.pincode}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Address</dt>
                <dd>{customer.address_line}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Landmark</dt>
                <dd>{customer.landmark ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Language</dt>
                <dd>{formatLanguage(customer.preferred_language)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>{formatCustomerStatus(customer.status)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">WhatsApp Verified</dt>
                <dd>{customer.is_whatsapp_verified ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Bookings / Last Service</dt>
                <dd>
                  {bookingCount} · {lastService ?? "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">Booking History</h2>
        {bookings.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No bookings yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">ID</th>
                  <th className="py-2">Service</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="py-2">
                      <Link
                        href={`/admin/bookings/${b.id}`}
                        className="text-blue-700"
                      >
                        {shortBookingId(b.id)}
                      </Link>
                    </td>
                    <td className="py-2">{b.service_type}</td>
                    <td className="py-2">{formatDate(b.service_date)}</td>
                    <td className="py-2">{formatBookingStatus(b.booking_status)}</td>
                    <td className="py-2">{formatCurrency(b.final_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-homigo-primary">
          Service Request History
        </h2>
        {serviceRequests.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No service requests yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">Service</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Slot</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Rate Card</th>
                </tr>
              </thead>
              <tbody>
                {serviceRequests.map((sr) => (
                  <tr key={sr.id} className="border-t">
                    <td className="py-2">
                      <Link
                        href={`/admin/service-requests/${sr.id}`}
                        className="text-blue-700"
                      >
                        {sr.service_type}
                      </Link>
                    </td>
                    <td className="py-2">{formatDate(sr.service_date)}</td>
                    <td className="py-2">{sr.preferred_time_slot}</td>
                    <td className="py-2">{sr.status}</td>
                    <td className="py-2">
                      {sr.rate_card_sent ? "Sent" : "No"} /{" "}
                      {sr.rate_card_accepted ? "Accepted" : "Pending"}
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
