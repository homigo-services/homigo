"use client";

import { useState } from "react";
import {
  getWorkerName,
  getWorkerPhotoUrl,
  toPreviewUrl,
} from "@/lib/workers/helpers";
import type { Worker } from "@/lib/workers/types";

interface WorkerPhotoProps {
  worker: Pick<
    Worker,
    | "Full name"
    | "photo_url"
    | "worker_documents"
    | "aadhaar_url"
    | "address_proof_url"
    | "police_verification_url"
    | "certificate_url"
  >;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "h-10 w-10 text-lg",
  md: "h-12 w-12 text-xl",
  lg: "h-24 w-24 text-3xl",
};

export function WorkerPhoto({
  worker,
  size = "sm",
  className = "",
}: WorkerPhotoProps) {
  const [broken, setBroken] = useState(false);
  const photoUrl = getWorkerPhotoUrl(worker);
  const sizeClass = SIZE_CLASSES[size];

  if (!photoUrl || broken) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-slate-200 ${sizeClass} ${className}`}
        aria-hidden
      >
        👤
      </span>
    );
  }

  return (
    <img
      src={toPreviewUrl(photoUrl)}
      alt={getWorkerName(worker)}
      className={`shrink-0 rounded-full object-cover ${sizeClass} ${className}`}
      onError={() => setBroken(true)}
    />
  );
}
