export type WorkerStatus = "active" | "inactive" | "pending" | "rejected";

export type DocumentVerificationStatus =
  | "not_uploaded"
  | "pending_review"
  | "verified"
  | "rejected";

export interface Service {
  id: string;
  name: string;
}

export interface WorkerService {
  id: string;
  worker_id: string;
  service_id: string;
  experience_years?: number | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  /** Joined from public.services */
  services?: Service | null;
}

/** Matches Supabase `workers` table (Google Form field names preserved). */
export interface Worker {
  id: string;
  worker_code: string;
  "Full name": string;
  mobile_number: string;
  alternatr_mobile: string | null;
  address_line: string | null;
  area: string | null;
  pincode: string | null;
  gender: string | null;
  qualification: string | null;
  preferred_language: string | null;
  preferred_timing: string | null;
  photo_url: string | null;
  experience_years: number;
  aadhaar_url: string | null;
  certificate_url: string | null;
  address_proof_url: string | null;
  police_verification_url: string | null;
  note: string | null;
  rating: number;
  total_jobs_completed: number;
  wallet_due_amount: number;
  status: WorkerStatus;
  is_verified: boolean;
  is_available: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_login_at: string | null;
  worker_services?: WorkerService[];
  worker_documents?: WorkerDocument[];
}

export interface WorkerDocument {
  id: string;
  worker_id: string;
  document_type: string;
  file_url: string;
  created_at: string;
  verification_status?: DocumentVerificationStatus;
  rejection_reason?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
}

export interface WorkerDocumentInput {
  documentType: string;
  fileUrl: string;
}

export type WorkerDisplayStatus = "Active" | "Inactive" | "Pending" | "Rejected";

export interface ImportWorkerResult {
  workerId: string;
  workerCode: string;
  workerName: string;
  servicesCount: number;
  documentsCount: number;
  verificationStatus: string;
  documentsPendingReview: number;
}

export interface GoogleFormWorkerPayload {
  "Aadhaar Upload"?: string;
  "Address Proof Upload"?: string;
  "Photo Upload"?: string;
  "Police Verification Upload"?: string;
  "Certificate Document Upload"?: string;
  "Full Name"?: string;
  "Mobile Number"?: string;
  "Full Address"?: string;
  "Alternate mobile"?: string;
  alternatr_mobile?: string;
  "Address line"?: string;
  address_line?: string;
  Area?: string;
  area?: string;
  Pincode?: string;
  pincode?: string;
  Gender?: string;
  gender?: string;
  Qualification?: string | string[];
  qualification?: string | string[];
  "Preferred language"?: string;
  preferred_language?: string;
  "Preferred Timing"?: string | string[];
  "Preferred timing"?: string;
  preferred_timing?: string | string[];
  "Service Type"?: string | string[];
  Services?: string;
  services?: string | string[];
  "Photo URL"?: string;
  photo_url?: string;
  "Aadhar URL"?: string;
  aadhar_url?: string;
  "Aadhaar URL"?: string;
  aadhaar_url?: string;
  "Certificate URL"?: string;
  certificate_url?: string;
  "Address Proof URL"?: string;
  address_proof_url?: string;
  "Police Verification URL"?: string;
  police_verification_url?: string;
  "Experience Years"?: string;
  experience_years?: string;
  Note?: string;
  note?: string;
  [key: string]: string | string[] | undefined;
}

export interface WorkerServiceInsertRow {
  worker_id: string;
  service_id: string;
  is_active: boolean;
  experience_years: number;
}

export interface ImportWorkerInput {
  fullName: string;
  mobile: string;
  alternateMobile?: string;
  gender: string;
  qualifications: string[];
  preferredTimings: string[];
  area: string;
  address: string;
  pincode: string;
  services: string[];
  experienceYears: number;
  aadhaarUrl?: string;
  certificateUrl?: string;
  addressProofUrl?: string;
  policeVerificationUrl?: string;
  photoUrl?: string;
}

export interface WorkerDocumentField {
  label: string;
  url: string;
  documentType: string;
  documentId?: string;
  verificationStatus: DocumentVerificationStatus;
  rejectionReason?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export interface WorkerDocumentSlot {
  documentType: string;
  label: string;
  document: WorkerDocument | null;
  url: string | null;
  verificationStatus: DocumentVerificationStatus;
  rejectionReason?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export interface WorkerVerificationSummary {
  totalSlots: number;
  uploadedCount: number;
  verifiedCount: number;
  rejectedCount: number;
  pendingCount: number;
  missingTypes: string[];
  canApprove: boolean;
  blockers: string[];
  workerVerificationStatus: "Pending Verification" | "Verified" | "Rejected";
}
