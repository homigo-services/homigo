"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildWhatsAppWebhookPayload,
  newSimulatorMessageId,
} from "@/lib/whatsapp/webhook-payload";

const DEFAULT_MOBILE = "919999888877";

interface StepLog {
  id: string;
  at: string;
  direction: "outbound";
  text: string;
  webhookOk: boolean;
  state: string | null;
  phase: string | null;
  serviceRequestId: string | null;
}

interface StatusPayload {
  mobile: string;
  conversation: {
    state?: string;
    context?: Record<string, unknown>;
    service_request_id?: string | null;
  } | null;
  customer: {
    preferred_language?: string;
    area?: string;
    pincode?: string;
    address_line?: string;
  } | null;
  serviceRequest: {
    id?: string;
    service_type?: string;
    status?: string;
    rate_card_sent?: boolean;
    rate_card_accepted?: boolean;
    service_date?: string;
    preferred_time_slot?: string;
  } | null;
  services: Array<{ index: number; id: string; name: string }>;
  plumberMenuNumber: number | null;
  matching?: {
    matching_status?: string;
    batch_number?: number;
    offer_count?: number;
    pending_offers?: number;
    accepted_worker_name?: string | null;
    offer_expires_at?: string | null;
    booking_id?: string | null;
  } | null;
  offers?: Array<{
    id: string;
    worker_id: string;
    worker_name: string;
    status: string;
    expires_at: string;
    batch_number: number;
  }>;
  booking?: {
    id?: string;
    worker_id?: string;
    booking_status?: string;
    final_amount?: number;
    payment_status?: string;
    Payment_mode?: string | null;
    payment_received_at?: string | null;
    otp_verified?: boolean;
    otp_generated_at?: string | null;
    otp_expires_at?: string | null;
    otp_attempts?: number;
  } | null;
  otp?: {
    has_hash?: boolean;
    generated_at?: string | null;
    expires_at?: string | null;
    attempts?: number;
    verified?: boolean;
    verified_at?: string | null;
    dev_otp?: string | null;
  } | null;
  completion?: {
    cash_completion_sent_at?: string | null;
    payment_completed_at?: string | null;
    payment_received_at?: string | null;
  } | null;
  confirmation?: {
    sent_at?: string | null;
    phase?: string | null;
    booking_ref?: string | null;
    final_amount?: number | null;
    payment_mode?: string | null;
    payment_status?: string | null;
  } | null;
  devAcceptLinks?: Array<{
    offerId: string;
    workerId: string;
    workerName: string;
    acceptPath: string;
    expiresAt: string;
  }>;
}

interface DevConfig {
  mockSend: boolean;
  webhookPath: string;
}

export function WhatsAppSimulator() {
  const [mobile, setMobile] = useState(DEFAULT_MOBILE);
  const [customText, setCustomText] = useState("");
  const [config, setConfig] = useState<DevConfig | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [steps, setSteps] = useState<StepLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");

  const refreshStatus = useCallback(async (m = mobile) => {
    const res = await fetch(`/api/dev/whatsapp/status?mobile=${encodeURIComponent(m)}`);
    if (!res.ok) throw new Error(`Status failed: ${res.status}`);
    const data = (await res.json()) as StatusPayload;
    setStatus(data);
    return data;
  }, [mobile]);

  useEffect(() => {
    fetch("/api/dev/whatsapp/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
    refreshStatus().catch((e) => setError(String(e)));
  }, [refreshStatus]);

  async function sendMessage(text: string) {
    setBusy(true);
    setError(null);
    try {
      const messageId = newSimulatorMessageId();
      const payload = buildWhatsAppWebhookPayload(messageId, mobile, text);

      const webhookRes = await fetch("/api/whatsapp/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await refreshStatus(mobile);
      const conv = data.conversation;

      setSteps((prev) => [
        {
          id: messageId,
          at: new Date().toLocaleTimeString(),
          direction: "outbound",
          text,
          webhookOk: webhookRes.ok,
          state: conv?.state ?? null,
          phase: (conv?.context?.phase as string) ?? null,
          serviceRequestId:
            conv?.service_request_id ??
            (conv?.context?.service_request_id as string) ??
            data.serviceRequest?.id ??
            null,
        },
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  async function acceptWorkerLink(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "GET" });
      if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
      await refreshStatus(mobile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  }

  async function requestCompletionOtp() {
    const bookingId = status?.booking?.id;
    const workerId = status?.booking?.worker_id;
    if (!bookingId || !workerId) {
      setError("No assigned booking/worker — complete worker accept first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/workers/request-completion-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, workerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `OTP request failed: ${res.status}`);
      if (json.dev_otp) setOtpInput(String(json.dev_otp));
      await refreshStatus(mobile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP request failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCashReceived() {
    const bookingId = status?.booking?.id;
    if (!bookingId) {
      setError("No booking — complete cash selection first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/workers/confirm-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Confirm failed: ${res.status}`);
      await refreshStatus(mobile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cash confirm failed");
    } finally {
      setBusy(false);
    }
  }

  const cashPending =
    status?.conversation?.context?.phase === "cash_payment_pending" ||
    (status?.booking?.Payment_mode === "cash" &&
      status?.booking?.payment_status === "pending" &&
      status?.conversation?.state === "payment_pending");

  const isCompleted =
    status?.conversation?.state === "completed" ||
    status?.booking?.booking_status === "completed";

  async function submitCustomerOtp() {
    if (!otpInput.trim()) return;
    await sendMessage(otpInput.trim());
  }

  async function handleReset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/whatsapp/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      if (!res.ok) throw new Error(`Reset failed: ${res.status}`);
      setSteps([]);
      await refreshStatus(mobile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  const plumberNum = status?.plumberMenuNumber;

  const quickActions: Array<{ label: string; text: string; hint?: string }> = [
    { label: "1. hi", text: "hi", hint: "Greeting → language menu" },
    { label: "2. Marathi (1)", text: "1", hint: "Language selection" },
    { label: "2. Hindi (2)", text: "2", hint: "Language selection" },
    { label: "2. English (3)", text: "3", hint: "Language selection" },
    {
      label: plumberNum ? `3. Plumber (${plumberNum})` : "3. Plumber (load services)",
      text: plumberNum ? String(plumberNum) : "1",
      hint: "Service selection from DB menu",
    },
    { label: "4. Area", text: "Kothrud", hint: "Customer area" },
    { label: "5. Pincode", text: "411038", hint: "6-digit pincode" },
    { label: "6. Address", text: "Flat 12, Sample Society", hint: "Full address" },
    { label: "7. Tomorrow (2)", text: "2", hint: "Date selection" },
    { label: "8. Slot 12–14 (3)", text: "3", hint: "2-hour slot" },
    { label: "9. Accept quote (1)", text: "1", hint: "Rate card accept" },
    { label: "Reject quote (2)", text: "2", hint: "Rate card reject" },
    { label: "10. Cash (1)", text: "1", hint: "After OTP verified" },
    { label: "11. Card (2)", text: "2", hint: "After OTP verified" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-8 border-b border-amber-500/40 pb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Development only — not for production
          </p>
          <h1 className="mt-2 text-2xl font-bold">WhatsApp Booking Simulator</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Sends Meta-format payloads to the real{" "}
            <code className="rounded bg-zinc-800 px-1">/api/whatsapp/webhook</code> route.
            Outbound WhatsApp is mocked when{" "}
            <code className="rounded bg-zinc-800 px-1">WHATSAPP_MOCK_SEND=true</code>.
          </p>
        </header>

        {config && !config.mockSend && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-950/40 p-4 text-sm text-red-200">
            Warning: WHATSAPP_MOCK_SEND is not true — outbound messages may hit Meta API.
            Add <code className="rounded bg-zinc-900 px-1">WHATSAPP_MOCK_SEND=true</code> to{" "}
            <code className="rounded bg-zinc-900 px-1">.env.local</code> and restart dev server.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <label className="block text-xs font-medium uppercase text-zinc-500">
                Test mobile (WhatsApp from)
              </label>
              <input
                type="text"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => refreshStatus()}
                className="mt-3 mr-2 rounded-lg bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600 disabled:opacity-50"
              >
                Refresh status
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleReset}
                className="mt-3 rounded-lg border border-amber-500/60 bg-amber-950/50 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-900/50 disabled:opacity-50"
              >
                Reset test customer
              </button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold text-zinc-300">Quick flow steps</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Click in order for full Plumber booking + accept (after reset).
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    title={action.hint}
                    disabled={busy}
                    onClick={() => sendMessage(action.text)}
                    className="rounded-lg border border-emerald-700/50 bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-100 hover:bg-emerald-900/50 disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold text-zinc-300">Custom message</h2>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Type any inbound text…"
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customText.trim()) {
                      sendMessage(customText.trim());
                      setCustomText("");
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !customText.trim()}
                  onClick={() => {
                    sendMessage(customText.trim());
                    setCustomText("");
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>

            {status?.services && status.services.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h2 className="text-sm font-semibold text-zinc-300">Service menu (DB)</h2>
                <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-400">
                  {status.services.map((s) => (
                    <li key={s.id}>
                      {s.index}. {s.name}
                      {s.name.toLowerCase() === "plumber" && (
                        <span className="ml-2 text-amber-400">← seeded rate card</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold text-zinc-300">Current state</h2>
              <dl className="mt-3 space-y-2 font-mono text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">conversation.state</dt>
                  <dd className="text-emerald-300">{status?.conversation?.state ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">context.phase</dt>
                  <dd>{String(status?.conversation?.context?.phase ?? "—")}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">service_request_id</dt>
                  <dd className="break-all text-amber-300">
                    {status?.conversation?.service_request_id ??
                      String(status?.conversation?.context?.service_request_id ?? "—")}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">preferred_language</dt>
                  <dd>{status?.customer?.preferred_language ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">area / pincode / address</dt>
                  <dd className="text-right">
                    {status?.customer?.area ?? "—"} / {status?.customer?.pincode ?? "—"} /{" "}
                    {status?.customer?.address_line ?? "—"}
                  </dd>
                </div>
              </dl>

              {status?.serviceRequest && (
                <div className="mt-4 border-t border-zinc-800 pt-4">
                  <h3 className="text-xs font-semibold uppercase text-zinc-500">
                    Service request
                  </h3>
                  <dl className="mt-2 space-y-1 font-mono text-xs">
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">id</dt>
                      <dd className="break-all text-amber-300">{status.serviceRequest.id}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">service_type</dt>
                      <dd>{status.serviceRequest.service_type}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">status</dt>
                      <dd>{status.serviceRequest.status}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">date / slot</dt>
                      <dd>
                        {status.serviceRequest.service_date} /{" "}
                        {status.serviceRequest.preferred_time_slot}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">rate_card_sent / accepted</dt>
                      <dd>
                        {String(status.serviceRequest.rate_card_sent)} /{" "}
                        {String(status.serviceRequest.rate_card_accepted)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>

            {(status?.matching || (status?.offers?.length ?? 0) > 0) && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h2 className="text-sm font-semibold text-zinc-300">Worker matching (batch 1)</h2>
                <dl className="mt-3 space-y-2 font-mono text-xs">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">matching_status</dt>
                    <dd className="text-emerald-300">{status?.matching?.matching_status ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">offers / pending</dt>
                    <dd>
                      {status?.matching?.offer_count ?? 0} / {status?.matching?.pending_offers ?? 0}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">offer_expires_at</dt>
                    <dd>{status?.matching?.offer_expires_at ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">accepted_worker</dt>
                    <dd>{status?.matching?.accepted_worker_name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">booking_id</dt>
                    <dd className="break-all text-amber-300">
                      {status?.booking?.id ?? status?.matching?.booking_id ?? "—"}
                    </dd>
                  </div>
                </dl>

                {status?.offers && status.offers.length > 0 && (
                  <ul className="mt-3 space-y-1 font-mono text-xs text-zinc-400">
                    {status.offers.map((o) => (
                      <li key={o.id}>
                        {o.worker_name} · {o.status} · expires {o.expires_at}
                      </li>
                    ))}
                  </ul>
                )}

                {status?.devAcceptLinks && status.devAcceptLinks.length > 0 && (
                  <div className="mt-4 border-t border-zinc-800 pt-3">
                    <p className="text-xs text-zinc-500">Simulate worker accept (dev only)</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {status.devAcceptLinks.map((link) => (
                        <button
                          key={link.offerId}
                          type="button"
                          disabled={busy}
                          onClick={() => acceptWorkerLink(link.acceptPath)}
                          className="rounded border border-blue-700/50 bg-blue-950/40 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/40 disabled:opacity-50"
                        >
                          Accept: {link.workerName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(status?.confirmation || status?.conversation?.state === "booking_confirmed" || status?.otp) && (
              <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4">
                <h2 className="text-sm font-semibold text-emerald-300">Booking & completion</h2>
                <dl className="mt-3 space-y-2 font-mono text-xs">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">conversation.state</dt>
                    <dd className="text-emerald-300">{status?.conversation?.state ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">confirmation_sent_at</dt>
                    <dd>{status?.confirmation?.sent_at ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">booking_ref</dt>
                    <dd>{status?.confirmation?.booking_ref ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">final_amount</dt>
                    <dd>₹{status?.confirmation?.final_amount ?? status?.booking?.final_amount ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">booking_status</dt>
                    <dd>{status?.booking?.booking_status ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">payment_status</dt>
                    <dd>{status?.booking?.payment_status ?? status?.confirmation?.payment_status ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Payment_mode</dt>
                    <dd>{status?.booking?.Payment_mode ?? status?.confirmation?.payment_mode ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">booking_id</dt>
                    <dd className="break-all text-amber-300">
                      {status?.booking?.id ?? status?.matching?.booking_id ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">otp_verified</dt>
                    <dd>{String(status?.otp?.verified ?? status?.booking?.otp_verified ?? false)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">otp_generated_at</dt>
                    <dd>{status?.otp?.generated_at ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">otp_expires_at</dt>
                    <dd>{status?.otp?.expires_at ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">otp_attempts</dt>
                    <dd>{status?.otp?.attempts ?? "—"}</dd>
                  </div>
                  {status?.otp?.dev_otp && (
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">dev_otp (mock only)</dt>
                      <dd className="text-amber-300">{status.otp.dev_otp}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 border-t border-emerald-900/40 pt-3">
                  <p className="text-xs text-zinc-500">Service completion OTP (dev)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={requestCompletionOtp}
                      className="rounded border border-amber-700/50 bg-amber-950/40 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
                    >
                      Worker requests OTP
                    </button>
                    <input
                      type="text"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Customer OTP"
                      className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs"
                    />
                    <button
                      type="button"
                      disabled={busy || otpInput.length !== 6}
                      onClick={submitCustomerOtp}
                      className="rounded border border-emerald-700/50 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50"
                    >
                      Submit OTP
                    </button>
                  </div>
                </div>

                {cashPending && !isCompleted && (
                  <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
                    <p className="text-xs font-semibold text-amber-200">Cash payment pending</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Customer selected Cash. Worker must confirm collection.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={confirmCashReceived}
                      className="mt-2 rounded border border-amber-600/60 bg-amber-900/50 px-2 py-1 text-xs text-amber-100 hover:bg-amber-800/50 disabled:opacity-50"
                    >
                      Worker: Confirm Cash Received
                    </button>
                  </div>
                )}
              </div>
            )}

            {isCompleted && (
              <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-4">
                <h2 className="text-sm font-semibold text-blue-300">Service completed</h2>
                <dl className="mt-3 space-y-2 font-mono text-xs">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">payment_status</dt>
                    <dd className="text-blue-300">{status?.booking?.payment_status ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">payment_received_at</dt>
                    <dd>{status?.booking?.payment_received_at ?? status?.completion?.payment_received_at ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">booking_status</dt>
                    <dd>{status?.booking?.booking_status ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">service-request status</dt>
                    <dd>{status?.serviceRequest?.status ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">final_amount</dt>
                    <dd>₹{status?.booking?.final_amount ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">cash_completion_sent_at</dt>
                    <dd>{status?.completion?.cash_completion_sent_at ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">conversation.state</dt>
                    <dd className="text-blue-300">{status?.conversation?.state ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">context.phase</dt>
                    <dd>{String(status?.conversation?.context?.phase ?? "—")}</dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold text-zinc-300">Step log</h2>
              {steps.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">
                  No messages yet. Click Reset, then run the quick flow.
                </p>
              ) : (
                <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
                  {steps.map((step) => (
                    <li
                      key={step.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-2 text-xs"
                    >
                      <div className="flex justify-between text-zinc-500">
                        <span>{step.at}</span>
                        <span>{step.webhookOk ? "webhook OK" : "webhook FAIL"}</span>
                      </div>
                      <p className="mt-1 font-medium text-zinc-200">
                        You → <span className="text-emerald-300">{step.text}</span>
                      </p>
                      <p className="mt-1 font-mono text-zinc-400">
                        state={step.state ?? "none"} · phase={step.phase ?? "—"} · sr=
                        {step.serviceRequestId ?? "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
