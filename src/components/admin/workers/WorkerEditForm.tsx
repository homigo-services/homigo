"use client";

import { useState } from "react";
import { patchWorkerClient, archiveWorkerClient } from "@/lib/workers/client-api";
import { getWorkerName } from "@/lib/workers/helpers";
import { getDocumentUrlFromWorker } from "@/lib/workers/documents";
import {
  WORKER_FORM_GENDER_OPTIONS,
  WORKER_FORM_PREFERRED_TIMING_OPTIONS,
  WORKER_FORM_QUALIFICATION_OPTIONS,
} from "@/lib/workers/form-options";
import {
  joinMultiSelectValues,
  splitStoredMultiSelect,
} from "@/lib/workers/import-fields";
import type { Worker } from "@/lib/workers/types";
import { DocumentUploadField } from "./DocumentUploadField";

interface WorkerEditFormProps {
  worker: Worker;
  onUpdated: () => void;
}

export function WorkerEditForm({ worker, onUpdated }: WorkerEditFormProps) {
  const [form, setForm] = useState({
    fullName: getWorkerName(worker),
    mobile: worker.mobile_number ?? "",
    alternateMobile: worker.alternatr_mobile ?? "",
    address: worker.address_line ?? "",
    area: worker.area ?? "",
    pincode: worker.pincode ?? "",
    gender: worker.gender ?? "",
    qualifications: splitStoredMultiSelect(worker.qualification),
    preferredLanguage: worker.preferred_language ?? "",
    preferredTimings: splitStoredMultiSelect(worker.preferred_timing),
    experienceYears: String(worker.experience_years ?? 0),
    photoUrl: getDocumentUrlFromWorker(worker, "photo"),
    aadhaarUrl: getDocumentUrlFromWorker(worker, "aadhaar"),
    certificateUrl: getDocumentUrlFromWorker(worker, "certificate"),
    addressProofUrl: getDocumentUrlFromWorker(worker, "address_proof"),
    policeVerificationUrl: getDocumentUrlFromWorker(worker, "police_verification"),
    note: worker.note ?? "",
    isAvailable: worker.is_available,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const parsedExperience = Number.parseInt(form.experienceYears, 10);

    const documents = [
      { documentType: "photo", fileUrl: form.photoUrl },
      { documentType: "aadhaar", fileUrl: form.aadhaarUrl },
      { documentType: "address_proof", fileUrl: form.addressProofUrl },
      { documentType: "police_verification", fileUrl: form.policeVerificationUrl },
      { documentType: "certificate", fileUrl: form.certificateUrl },
    ]
      .map((doc) => ({
        documentType: doc.documentType,
        fileUrl: doc.fileUrl?.trim() ?? "",
      }))
      .filter((doc) => doc.fileUrl.length > 0);

    const { error: patchError } = await patchWorkerClient(worker.id, {
      action: "update",
      worker: {
        "Full name": form.fullName.trim(),
        mobile_number: form.mobile.trim(),
        alternatr_mobile: form.alternateMobile.trim() || null,
        address_line: form.address.trim() || null,
        area: form.area.trim() || null,
        pincode: form.pincode.trim() || null,
        gender: form.gender.trim() || null,
        qualification: joinMultiSelectValues(form.qualifications),
        preferred_language: form.preferredLanguage.trim() || null,
        preferred_timing: joinMultiSelectValues(form.preferredTimings),
        experience_years: Number.isFinite(parsedExperience) ? parsedExperience : 0,
        note: form.note.trim() || null,
        is_available: form.isAvailable,
      },
      documents,
    });

    if (patchError) {
      setError(patchError);
    } else {
      setSuccess("Profile updated");
      onUpdated();
    }

    setSaving(false);
  }

  async function handleArchive() {
    if (!confirm("Archive this worker? They will be hidden from the list.")) {
      return;
    }

    setSaving(true);
    setError(null);

    const { error: archiveError } = await archiveWorkerClient(worker.id);

    if (archiveError) {
      setError(archiveError);
      setSaving(false);
      return;
    }

    window.location.href = "/admin/workers";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Full Name</span>
          <input
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Mobile</span>
          <input
            required
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Alternate Mobile</span>
          <input
            value={form.alternateMobile}
            onChange={(e) =>
              setForm({ ...form, alternateMobile: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Area</span>
          <input
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
          />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-slate-600">Address</span>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Pincode</span>
          <input
            value={form.pincode}
            onChange={(e) => setForm({ ...form, pincode: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Gender</span>
          <select
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
          >
            <option value="">Select gender</option>
            {WORKER_FORM_GENDER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="block text-sm sm:col-span-2">
          <span className="mb-2 block text-slate-600">Qualification</span>
          <div className="flex flex-wrap gap-2">
            {WORKER_FORM_QUALIFICATION_OPTIONS.map((option) => {
              const active = form.qualifications.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      qualifications: active
                        ? form.qualifications.filter((q) => q !== option)
                        : [...form.qualifications, option],
                    })
                  }
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    active
                      ? "bg-blue-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Preferred Language</span>
          <input
            value={form.preferredLanguage}
            onChange={(e) =>
              setForm({ ...form, preferredLanguage: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
          />
        </label>

        <div className="block text-sm sm:col-span-2">
          <span className="mb-2 block text-slate-600">Preferred Timing</span>
          <div className="flex flex-wrap gap-2">
            {WORKER_FORM_PREFERRED_TIMING_OPTIONS.map((option) => {
              const active = form.preferredTimings.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      preferredTimings: active
                        ? form.preferredTimings.filter((t) => t !== option)
                        : [...form.preferredTimings, option],
                    })
                  }
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    active
                      ? "bg-blue-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Experience (years)</span>
          <input
            type="number"
            min={0}
            value={form.experienceYears}
            onChange={(e) =>
              setForm({ ...form, experienceYears: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
          />
        </label>

        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) =>
              setForm({ ...form, isAvailable: e.target.checked })
            }
            className="h-4 w-4"
          />
          <span className="text-slate-600">Available for jobs</span>
        </label>

        <div className="space-y-4 sm:col-span-2">
          <p className="text-sm font-semibold text-slate-600">Documents</p>

          <DocumentUploadField
            label="Photo Upload"
            documentKey="photo"
            value={form.photoUrl}
            onChange={(url) => setForm({ ...form, photoUrl: url })}
          />

          <DocumentUploadField
            label="Aadhaar Upload"
            documentKey="aadhaar"
            value={form.aadhaarUrl}
            onChange={(url) => setForm({ ...form, aadhaarUrl: url })}
          />

          <DocumentUploadField
            label="Address Proof Upload"
            documentKey="address-proof"
            value={form.addressProofUrl}
            onChange={(url) => setForm({ ...form, addressProofUrl: url })}
          />

          <DocumentUploadField
            label="Police Verification Upload"
            documentKey="police-verification"
            value={form.policeVerificationUrl}
            onChange={(url) =>
              setForm({ ...form, policeVerificationUrl: url })
            }
          />

          <DocumentUploadField
            label="Certificate Document Upload"
            documentKey="certificate"
            value={form.certificateUrl}
            onChange={(url) => setForm({ ...form, certificateUrl: url })}
          />
        </div>

        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-slate-600">Admin Note</span>
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="h-24 w-full rounded-xl border border-slate-300 p-4 outline-none focus:border-blue-700"
          />
        </label>
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

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-blue-900 px-6 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={handleArchive}
          className="rounded-xl border border-red-300 px-6 py-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          Archive Worker
        </button>
      </div>
    </form>
  );
}
