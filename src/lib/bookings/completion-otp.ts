import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const COMPLETION_OTP_TTL_MINUTES = 10;
export const COMPLETION_OTP_MAX_ATTEMPTS = 5;
export const COMPLETION_OTP_LENGTH = 6;

export type RequestCompletionOtpError =
  | "booking_not_found"
  | "worker_not_assigned"
  | "invalid_booking_state"
  | "already_verified"
  | "customer_not_found"
  | "update_failed";

export type VerifyCompletionOtpError =
  | "booking_not_found"
  | "worker_mismatch"
  | "worker_not_assigned"
  | "no_otp_pending"
  | "already_verified"
  | "expired"
  | "too_many_attempts"
  | "invalid_otp"
  | "update_failed";

export function generateCompletionOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(COMPLETION_OTP_LENGTH, "0");
}

export function hashCompletionOtp(rawOtp: string): string {
  return createHash("sha256").update(rawOtp.trim(), "utf8").digest("hex");
}

export function verifyCompletionOtpHash(rawOtp: string, storedHash: string): boolean {
  const computed = hashCompletionOtp(rawOtp);
  try {
    const a = Buffer.from(computed, "utf8");
    const b = Buffer.from(storedHash, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseOtpFromText(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (digits.length === COMPLETION_OTP_LENGTH) return digits;
  return null;
}

function isOtpExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

interface BookingOtpRow {
  id: string;
  worker_id: string;
  customer_id: string;
  booking_status: string;
  completion_otp_hash: string | null;
  otp_generated_at: string | null;
  otp_expires_at: string | null;
  otp_attempts: number | null;
  otp_verified: boolean | null;
}

export interface RequestCompletionOtpResult {
  ok: boolean;
  error?: RequestCompletionOtpError;
  alreadySent?: boolean;
  internalNotifyOtp?: string;
  customerMobile?: string;
  bookingId?: string;
}

export async function requestCompletionOtp(
  supabase: SupabaseClient,
  input: { bookingId: string; workerId: string },
): Promise<RequestCompletionOtpResult> {
  const { data: booking, error } = await supabase
    .from("booking")
    .select(
      "id, worker_id, customer_id, booking_status, completion_otp_hash, otp_generated_at, otp_expires_at, otp_attempts, otp_verified",
    )
    .eq("id", input.bookingId)
    .maybeSingle();

  if (error || !booking) {
    return { ok: false, error: "booking_not_found" };
  }

  const row = booking as BookingOtpRow;

  if (String(row.worker_id) !== String(input.workerId)) {
    return { ok: false, error: "worker_not_assigned" };
  }

  if (row.otp_verified) {
    return { ok: false, error: "already_verified" };
  }

  const status = String(row.booking_status ?? "");
  if (status !== "assigned" && status !== "in_progress") {
    return { ok: false, error: "invalid_booking_state" };
  }

  const hasActiveOtp =
    row.completion_otp_hash &&
    !isOtpExpired(row.otp_expires_at) &&
    (row.otp_attempts ?? 0) < COMPLETION_OTP_MAX_ATTEMPTS;

  if (hasActiveOtp) {
    const { data: customer } = await supabase
      .from("customers")
      .select("mobile")
      .eq("id", row.customer_id)
      .maybeSingle();
    return {
      ok: true,
      alreadySent: true,
      customerMobile: customer?.mobile ? String(customer.mobile) : undefined,
      bookingId: row.id,
    };
  }

  const rawOtp = generateCompletionOtp();
  const hash = hashCompletionOtp(rawOtp);
  const now = new Date();
  const expires = new Date(now.getTime() + COMPLETION_OTP_TTL_MINUTES * 60 * 1000);

  const { error: updateError } = await supabase
    .from("booking")
    .update({
      completion_otp_hash: hash,
      otp_generated_at: now.toISOString(),
      otp_expires_at: expires.toISOString(),
      otp_attempts: 0,
      booking_status: "in_progress",
      updated_at: now.toISOString(),
    })
    .eq("id", input.bookingId)
    .eq("worker_id", input.workerId)
    .eq("otp_verified", false);

  if (updateError) {
    return { ok: false, error: "update_failed" };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("mobile")
    .eq("id", row.customer_id)
    .maybeSingle();

  if (!customer?.mobile) {
    return { ok: false, error: "customer_not_found" };
  }

  return {
    ok: true,
    alreadySent: false,
    customerMobile: String(customer.mobile),
    bookingId: row.id,
    internalNotifyOtp: rawOtp,
  };
}

export interface VerifyCompletionOtpResult {
  ok: boolean;
  error?: VerifyCompletionOtpError;
  alreadyVerified?: boolean;
  attemptsRemaining?: number;
}

export async function verifyCompletionOtp(
  supabase: SupabaseClient,
  input: { bookingId: string; workerId: string; rawOtp: string },
): Promise<VerifyCompletionOtpResult> {
  const { data: booking, error } = await supabase
    .from("booking")
    .select(
      "id, worker_id, customer_id, completion_otp_hash, otp_expires_at, otp_attempts, otp_verified",
    )
    .eq("id", input.bookingId)
    .maybeSingle();

  if (error || !booking) {
    return { ok: false, error: "booking_not_found" };
  }

  if (!booking.worker_id) {
    return { ok: false, error: "worker_not_assigned" };
  }

  if (String(booking.worker_id) !== String(input.workerId)) {
    return { ok: false, error: "worker_mismatch" };
  }

  if (booking.otp_verified) {
    return { ok: true, alreadyVerified: true };
  }

  const attempts = Number(booking.otp_attempts ?? 0);
  if (attempts >= COMPLETION_OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "too_many_attempts", attemptsRemaining: 0 };
  }

  if (!booking.completion_otp_hash) {
    return { ok: false, error: "no_otp_pending" };
  }

  if (isOtpExpired(booking.otp_expires_at ? String(booking.otp_expires_at) : null)) {
    return { ok: false, error: "expired" };
  }

  const valid = verifyCompletionOtpHash(input.rawOtp, String(booking.completion_otp_hash));

  if (!valid) {
    const nextAttempts = attempts + 1;
    await supabase
      .from("booking")
      .update({
        otp_attempts: nextAttempts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.bookingId);

    if (nextAttempts >= COMPLETION_OTP_MAX_ATTEMPTS) {
      return { ok: false, error: "too_many_attempts", attemptsRemaining: 0 };
    }

    return {
      ok: false,
      error: "invalid_otp",
      attemptsRemaining: COMPLETION_OTP_MAX_ATTEMPTS - nextAttempts,
    };
  }

  const now = new Date().toISOString();
  const { error: verifyError } = await supabase
    .from("booking")
    .update({
      otp_verified: true,
      otp_verified_at: now,
      updated_at: now,
    })
    .eq("id", input.bookingId)
    .eq("worker_id", input.workerId)
    .eq("otp_verified", false);

  if (verifyError) {
    return { ok: false, error: "update_failed" };
  }

  return { ok: true, alreadyVerified: false };
}

/** Booking with a pending completion OTP for this worker (for WhatsApp/App routing). */
export async function getBookingPendingWorkerOtpVerification(
  supabase: SupabaseClient,
  workerId: string,
): Promise<{ bookingId: string; customerId: string } | null> {
  const { data: booking } = await supabase
    .from("booking")
    .select(
      "id, customer_id, completion_otp_hash, otp_expires_at, otp_verified, otp_attempts, booking_status",
    )
    .eq("worker_id", workerId)
    .eq("otp_verified", false)
    .in("booking_status", ["assigned", "in_progress"])
    .not("completion_otp_hash", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!booking?.completion_otp_hash) return null;
  if (isOtpExpired(booking.otp_expires_at ? String(booking.otp_expires_at) : null)) {
    return null;
  }
  if (Number(booking.otp_attempts ?? 0) >= COMPLETION_OTP_MAX_ATTEMPTS) {
    return null;
  }

  return {
    bookingId: String(booking.id),
    customerId: String(booking.customer_id),
  };
}
