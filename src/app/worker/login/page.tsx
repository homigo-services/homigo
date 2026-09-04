"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WorkerLoginPage() {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"mobile" | "otp">("mobile");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDevOtp(null);

    const res = await fetch("/api/worker/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; devOtp?: string };

    setLoading(false);
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Failed to send OTP");
      return;
    }

    if (data.devOtp) setDevOtp(data.devOtp);
    setStep("otp");
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/worker/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mobile, otp }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };

    setLoading(false);
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Invalid OTP");
      return;
    }

    router.replace("/worker/offers");
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-8">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">Worker login</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Enter your registered mobile number to receive an OTP.
        </p>
      </div>

      {step === "mobile" ? (
        <form onSubmit={requestOtp} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Mobile number</span>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="919876543210"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="space-y-4">
          {devOtp && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Dev OTP: <strong>{devOtp}</strong>
            </p>
          )}
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">OTP</span>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit OTP"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 tracking-widest"
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Verify & login"}
          </button>
          <button
            type="button"
            onClick={() => setStep("mobile")}
            className="w-full text-sm text-zinc-600"
          >
            Change mobile number
          </button>
        </form>
      )}
    </div>
  );
}
