"use client";

import { useRef, useState } from "react";
import {
  getWorkerDocumentMaxSizeMb,
  WORKER_DOCUMENT_ACCEPT,
} from "@/lib/workers/config";
import { isImageUrl, isPdfUrl, toPreviewUrl } from "@/lib/workers/helpers";

interface DocumentUploadFieldProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  documentKey: string;
}

function fileNameFromUrl(url: string, fallback = "Uploaded file"): string {
  if (url.startsWith("data:")) {
    const mime = url.slice(5, url.indexOf(";"));
    if (mime.includes("pdf")) return "document.pdf";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "photo.jpg";
    if (mime.includes("png")) return "photo.png";
    return fallback;
  }

  try {
    const parts = url.split("/");
    return decodeURIComponent(parts[parts.length - 1] ?? fallback);
  } catch {
    return fallback;
  }
}

export function DocumentUploadField({
  label,
  value,
  onChange,
  documentKey,
}: DocumentUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(
    value ? fileNameFromUrl(value) : null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  async function handleFileSelected(file: File) {
    setLocalError(null);
    setPreviewOpen(false);
    setUploading(true);
    setProgress(15);
    setFileName(file.name);

    const tick = window.setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + 10));
    }, 150);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentKey", documentKey);

      const response = await fetch("/api/workers/documents/upload", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as {
        success?: boolean;
        url?: string;
        fileName?: string;
        message?: string;
      };

      window.clearInterval(tick);
      setProgress(100);
      setUploading(false);

      if (!response.ok || !json.success || !json.url) {
        setLocalError(json.message ?? `File upload failed (${response.status}).`);
        setProgress(0);
        return;
      }

      setFileName(json.fileName ?? file.name);
      onChange(json.url);
      setProgress(0);
    } catch (err) {
      window.clearInterval(tick);
      setUploading(false);
      setProgress(0);
      const message =
        err instanceof Error ? err.message : "Network error during upload.";
      setLocalError(`File upload failed: ${message}`);
    }
  }

  function handleRemove() {
    onChange(null);
    setFileName(null);
    setLocalError(null);
    setPreviewOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handlePreviewClick() {
    if (!value) return;
    setPreviewOpen((open) => !open);
  }

  const previewUrl = value ? toPreviewUrl(value) : null;
  const isImage = value ? isImageUrl(value) : false;
  const isPdf = value ? isPdfUrl(value) : false;
  const isInlinePreviewSafe =
    Boolean(value) && isImage && !value!.startsWith("data:application/pdf");

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-homigo-primary">{label}</p>
          <p className="mt-1 text-xs text-slate-500">
            PDF, JPG, JPEG, PNG — max {getWorkerDocumentMaxSizeMb()} MB
          </p>
          {fileName && (
            <p className="mt-1 text-xs font-medium text-slate-700">
              File: {fileName}
            </p>
          )}
        </div>

        {!value && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "📎 Upload File"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={WORKER_DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFileSelected(file);
          e.target.value = "";
        }}
      />

      {uploading && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-blue-700 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Uploading {fileName ?? "file"}...
          </p>
        </div>
      )}

      {localError && (
        <p className="mt-3 text-sm text-red-600">{localError}</p>
      )}

      {value && (
        <div className="mt-4 space-y-3">
          <div className="overflow-hidden rounded-lg border bg-white">
            {previewOpen && isInlinePreviewSafe && previewUrl ? (
              // biome-ignore lint/a11y/useAltText: document preview
              <img
                src={previewUrl}
                alt={label}
                className="max-h-48 w-full object-contain"
              />
            ) : previewOpen && isPdf ? (
              <div className="p-4 text-sm text-slate-600">
                PDF uploaded. Use Preview to open it in a new tab.
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 text-sm text-slate-600">
                <span className="text-2xl">{isPdf ? "📄" : "🖼️"}</span>
                <span>{fileName ?? "Document uploaded"}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePreviewClick}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-white"
            >
              {previewOpen ? "Hide" : "Preview"}
            </button>
            {value.startsWith("http") && (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-white"
              >
                Open
              </a>
            )}
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-60"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={handleRemove}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
