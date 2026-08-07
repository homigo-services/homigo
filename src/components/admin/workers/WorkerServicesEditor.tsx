"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { updateWorkerServicesClient } from "@/lib/workers/client-api";
import { fetchServiceCatalog } from "@/lib/workers/service-resolver";

interface WorkerServicesEditorProps {
  workerId: string;
  initialServices: string[];
  onUpdated: () => void;
}

export function WorkerServicesEditor({
  workerId,
  initialServices,
  onUpdated,
}: WorkerServicesEditorProps) {
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selected, setSelected] = useState<string[]>(initialServices);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setSelected(initialServices);
  }, [initialServices]);

  useEffect(() => {
    setLoadingCatalog(true);
    fetchServiceCatalog(supabase).then(({ data, error: catalogError }) => {
      if (!catalogError && data.length > 0) {
        setCatalog(data.map((s) => s.name));
      } else {
        setCatalog([]);
      }
      setLoadingCatalog(false);
    });
  }, []);

  function toggleService(service: string) {
    setSelected((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service],
    );
  }

  async function saveServices() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const { error: saveError } = await updateWorkerServicesClient(
      workerId,
      selected,
    );

    if (saveError) {
      setError(saveError);
    } else {
      setSuccess("Services saved");
      onUpdated();
    }

    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Services must exist in the <code className="font-mono">services</code>{" "}
        catalog before they can be assigned.
      </p>

      <div className="flex flex-wrap gap-2">
        {loadingCatalog ? (
          <p className="text-sm text-slate-400">Loading services...</p>
        ) : catalog.length === 0 ? (
          <p className="text-sm text-red-600">
            No services in public.services — add rows first.
          </p>
        ) : (
          catalog.map((service) => {
            const active = selected.includes(service);
            return (
              <button
                key={service}
                type="button"
                onClick={() => toggleService(service)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-blue-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {service}
              </button>
            );
          })
        )}

        {selected
          .filter((s) => !catalog.includes(s))
          .map((service) => (
            <button
              key={service}
              type="button"
              onClick={() => toggleService(service)}
              className="rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900"
              title="Not in services catalog — add to public.services first"
            >
              {service} ×
            </button>
          ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {success && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      )}

      <button
        type="button"
        disabled={saving || loadingCatalog || catalog.length === 0}
        onClick={saveServices}
        className="rounded-xl bg-blue-900 px-6 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save Services"}
      </button>
    </div>
  );
}
