/** Matches `public.booking` (live schema + migration 009 OTP columns). */
export type BookingStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | string;

export type PaymentStatus = "pending" | "paid" | "failed" | string;

export type PaymentMode = "online" | "cash" | "upi" | string;

export interface Booking {
  id: string;
  /** Legacy column name in DB (typo preserved). */
  sevice_request_id: string;
  customer_id: string;
  worker_id: string;
  service_date: string;
  service_time_slot: string | null;
  booking_status: BookingStatus;
  payment_status: PaymentStatus;
  /** Legacy column name in DB (capital P preserved). */
  Payment_mode: PaymentMode | null;
  base_amount: number;
  payment_received_at: string | null;
  /** Legacy timestamptz column — do NOT store numeric OTP here. */
  service_completion_otp: string | null;
  otp_verified: boolean;
  otp_verified_at: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  platform_commission: number;
  lead_charge: number | null;
  final_amount: number;
  worker_earning: number | null;
  worker_rating: number | null;
  cancel_reason: string | null;
  /** Migration 009 — secure OTP storage. */
  completion_otp_hash?: string | null;
  otp_generated_at?: string | null;
  otp_expires_at?: string | null;
  otp_attempts?: number;
}

/** Matches `public.worker_service_offers` (migration 011). */
export type WorkerServiceOfferStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

export interface WorkerServiceOffer {
  id: string;
  service_request_id: string;
  worker_id: string;
  batch_number: number;
  offered_at: string;
  expires_at: string;
  status: WorkerServiceOfferStatus;
  accept_token_hash: string;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}
