"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { importWorkerClient } from "@/lib/workers/client-api";
import {
  WORKER_FORM_GENDER_OPTIONS,
  WORKER_FORM_PREFERRED_TIMING_OPTIONS,
  WORKER_FORM_QUALIFICATION_OPTIONS,
} from "@/lib/workers/form-options";
import {
  formatImportWorkerValidationSummary,
  getImportWorkerValidationIssues,
  type ImportWorkerFieldKey,
} from "@/lib/workers/import-validation";
import type { ImportWorkerInput } from "@/lib/workers/types";
import { fetchServiceCatalog } from "@/lib/workers/service-resolver";
import { DocumentUploadField } from "./DocumentUploadField";

interface ImportWorkerModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: {
    workerName: string;
    workerCode: string;
    servicesCount: number;
    documentsCount: number;
    verificationStatus: string;
    documentsPendingReview: number;
  }) => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
  required = false,
  error,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (values: string[]) => void;
  required?: boolean;
  error?: string;
}) {
  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm text-slate-600">
        {label}
        {required ? " *" : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <label
              key={option}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-sm ${
                active
                  ? "bg-blue-900 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(option)}
                className="sr-only"
              />
              {option}
            </label>
          );
        })}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export function ImportWorkerModal({
  open,
  onClose,
  onImported,
}: ImportWorkerModalProps) {
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState("");
  const [mobile, setMobile] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState("");
  const [area, setArea] = useState("");
  const [pincode, setPincode] = useState("");
  const [preferredTimings, setPreferredTimings] = useState<string[]>([]);
  const [fullAddress, setFullAddress] = useState("");
  const [aadhaarUrl, setAadhaarUrl] = useState<string | null>(null);
  const [addressProofUrl, setAddressProofUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [policeVerificationUrl, setPoliceVerificationUrl] = useState<
    string | null
  >(null);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setLoadingCatalog(true);
    fetchServiceCatalog(supabase).then(({ data, error: catalogError }) => {
      if (catalogError) {
        setError("Could not load services. Please try again.");
        setCatalog([]);
      } else {
        setCatalog(data.map((s) => s.name));
      }
      setLoadingCatalog(false);
    });
  }, [open]);

  const formInput: ImportWorkerInput = useMemo(
    () => ({
      fullName: fullName.trim(),
      mobile: mobile.trim(),
      gender,
      qualifications,
      preferredTimings,
      services: selectedServices,
      experienceYears: experienceYears.trim()
        ? Number.parseInt(experienceYears, 10)
        : Number.NaN,
      area: area.trim(),
      pincode: pincode.trim(),
      address: fullAddress.trim(),
      aadhaarUrl: aadhaarUrl ?? undefined,
      addressProofUrl: addressProofUrl ?? undefined,
      photoUrl: photoUrl ?? undefined,
      policeVerificationUrl: policeVerificationUrl ?? undefined,
      certificateUrl: certificateUrl ?? undefined,
    }),
    [
      fullName,
      mobile,
      gender,
      qualifications,
      preferredTimings,
      selectedServices,
      experienceYears,
      area,
      pincode,
      fullAddress,
      aadhaarUrl,
      addressProofUrl,
      photoUrl,
      policeVerificationUrl,
      certificateUrl,
    ],
  );

  const validationIssues = useMemo(
    () =>
      getImportWorkerValidationIssues(formInput, {
        loadingCatalog,
        catalogCount: catalog.length,
      }),
    [formInput, loadingCatalog, catalog.length],
  );

  const issueByField = useMemo(() => {
    const map = new Map<ImportWorkerFieldKey, string>();
    for (const issue of validationIssues) {
      if (!map.has(issue.field)) {
        map.set(issue.field, issue.message);
      }
    }
    return map;
  }, [validationIssues]);

  const showFieldError = (field: ImportWorkerFieldKey) =>
    attemptedSubmit ? issueByField.get(field) : undefined;

  const canSubmit =
    !submitting && !loadingCatalog && validationIssues.length === 0;

  function resetForm() {
    setFullName("");
    setGender("");
    setMobile("");
    setSelectedServices([]);
    setQualifications([]);
    setExperienceYears("");
    setArea("");
    setPincode("");
    setPreferredTimings([]);
    setFullAddress("");
    setAadhaarUrl(null);
    setAddressProofUrl(null);
    setPhotoUrl(null);
    setPoliceVerificationUrl(null);
    setCertificateUrl(null);
    setError(null);
    setSuccess(null);
    setAttemptedSubmit(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttemptedSubmit(true);
    setError(null);
    setSuccess(null);

    if (validationIssues.length > 0) {
      setError(formatImportWorkerValidationSummary(validationIssues));
      return;
    }

    setSubmitting(true);

    const { result, error: importError } = await importWorkerClient(formInput);

    setSubmitting(false);

    if (importError || !result) {
      setError(importError ?? "Failed to import worker.");
      return;
    }

    const successMessage = `Worker imported successfully. ${result.workerName} (${result.workerCode}) — ${result.servicesCount} service(s), ${result.documentsCount} document(s). Verification: ${result.verificationStatus}.`;
    setSuccess(successMessage);
    onImported({
      workerName: result.workerName,
      workerCode: result.workerCode,
      servicesCount: result.servicesCount,
      documentsCount: result.documentsCount,
      verificationStatus: result.verificationStatus,
      documentsPendingReview: result.documentsPendingReview,
    });

    setTimeout(() => {
      resetForm();
      onClose();
    }, 1800);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-homigo-primary">
              Import Worker
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Matches the Google Worker Registration Form. Fields marked * are
              required. Document uploads are optional.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* 1. Full Name * */}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Full Name *</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
            />
            <FieldError message={showFieldError("fullName")} />
          </label>

          {/* 2. Gender * */}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Gender *</span>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
            >
              <option value="">Select gender</option>
              {WORKER_FORM_GENDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <FieldError message={showFieldError("gender")} />
          </label>

          {/* 3. Mobile Number * */}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Mobile Number *</span>
            <input
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) =>
                setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="10-digit mobile"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
            />
            <FieldError message={showFieldError("mobile")} />
          </label>

          {/* 4. Service Type * */}
          <div>
            <p className="mb-2 text-sm text-slate-600">Service Type *</p>
            {loadingCatalog ? (
              <p className="text-sm text-slate-400">Loading services...</p>
            ) : catalog.length === 0 ? (
              <p className="text-sm text-red-600">
                No services available. Add services in the catalog first.
              </p>
            ) : (
              <CheckboxGroup
                label=""
                options={catalog}
                selected={selectedServices}
                onChange={setSelectedServices}
                error={showFieldError("services")}
              />
            )}
            <FieldError message={showFieldError("catalog")} />
          </div>

          {/* 5. Qualification * */}
          <CheckboxGroup
            label="Qualification"
            options={WORKER_FORM_QUALIFICATION_OPTIONS}
            selected={qualifications}
            onChange={setQualifications}
            required
            error={showFieldError("qualifications")}
          />

          {/* 6. Experience Years * */}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Experience Years *</span>
            <input
              type="number"
              min={0}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              placeholder="e.g. 3"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
            />
            <FieldError message={showFieldError("experienceYears")} />
          </label>

          {/* 7. Area * */}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Area *</span>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
            />
            <FieldError message={showFieldError("area")} />
          </label>

          {/* 8. Pincode * */}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Pincode *</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={pincode}
              onChange={(e) =>
                setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="6-digit pincode"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
            />
            <FieldError message={showFieldError("pincode")} />
          </label>

          {/* 9. Preferred Timing * */}
          <CheckboxGroup
            label="Preferred Timing"
            options={WORKER_FORM_PREFERRED_TIMING_OPTIONS}
            selected={preferredTimings}
            onChange={setPreferredTimings}
            required
            error={showFieldError("preferredTimings")}
          />

          {/* 10. Full Address * */}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Full Address *</span>
            <textarea
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              className="min-h-24 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-700"
            />
            <FieldError message={showFieldError("address")} />
          </label>

          {/* 11–15. Document uploads (optional) */}
          <DocumentUploadField
            label="Aadhaar Upload"
            documentKey="aadhaar"
            value={aadhaarUrl}
            onChange={setAadhaarUrl}
          />

          <DocumentUploadField
            label="Address Proof Upload"
            documentKey="address-proof"
            value={addressProofUrl}
            onChange={setAddressProofUrl}
          />

          <DocumentUploadField
            label="Photo Upload"
            documentKey="photo"
            value={photoUrl}
            onChange={setPhotoUrl}
          />

          <DocumentUploadField
            label="Police Verification Upload"
            documentKey="police-verification"
            value={policeVerificationUrl}
            onChange={setPoliceVerificationUrl}
          />

          <DocumentUploadField
            label="Certificate Document Upload"
            documentKey="certificate"
            value={certificateUrl}
            onChange={setCertificateUrl}
          />

          {validationIssues.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Required fields still missing</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {validationIssues.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            </div>
          )}

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

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-300 py-3 font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingCatalog}
              className={`flex-1 rounded-xl py-3 font-semibold text-white ${
                canSubmit
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-green-600/70 hover:bg-green-600/80"
              } disabled:opacity-60`}
              title={
                validationIssues.length > 0
                  ? formatImportWorkerValidationSummary(validationIssues)
                  : undefined
              }
            >
              {submitting
                ? "Importing..."
                : loadingCatalog
                  ? "Loading services..."
                  : canSubmit
                    ? "Import Worker"
                    : "Import Worker — complete required fields"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
