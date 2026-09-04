"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type WorkerProfile = {
  worker_code: string;
  "Full name": string;
  mobile_number: string;
  area: string;
  pincode: string;
  is_available: boolean;
  status: string;
  services: Array<{ name?: string }>;
};

export default function WorkerProfilePage() {
  const router = useRouter();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/worker/me", { credentials: "include" });
    if (res.status === 401) {
      router.replace("/worker/login");
      return;
    }
    const data = (await res.json()) as { ok?: boolean; worker?: WorkerProfile };
    setLoading(false);
    setWorker(data.worker ?? null);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch("/api/worker/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/worker/login");
  }

  if (loading) {
    return <p className="text-zinc-600">Loading profile…</p>;
  }

  if (!worker) {
    return <p className="text-red-600">Profile unavailable.</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Profile</h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold">{worker["Full name"]}</p>
        <p className="text-sm text-zinc-600">{worker.worker_code}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-zinc-500">Mobile</dt>
            <dd>{worker.mobile_number}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Area</dt>
            <dd>
              {worker.area}, {worker.pincode}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Availability</dt>
            <dd>{worker.is_available ? "Available" : "Unavailable"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Services</dt>
            <dd>
              {worker.services.map((s) => s.name).filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
        </dl>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="w-full rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-700"
      >
        Logout
      </button>
    </div>
  );
}
