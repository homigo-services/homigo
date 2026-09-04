import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWhatsAppMobile } from "@/lib/whatsapp/parser";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import {
  acceptWorkerOffer,
  finalizeWorkerOfferAcceptance,
  rejectWorkerOffer,
} from "./offer-actions";
import { findWorkerByMobile } from "./auth";
import {
  workerOfferAcceptedMessage,
  workerOfferExpiredMessage,
  workerOfferRejectedMessage,
  workerOfferUnavailableMessage,
} from "./worker-messages";
import {
  getBookingPendingWorkerOtpVerification,
  parseOtpFromText,
} from "@/lib/bookings/completion-otp";
import { executeWorkerCompletionOtpVerification } from "@/lib/bookings/completion-otp-verify";
import {
  workerCompletionOtpExpiredMessage,
  workerCompletionOtpFailedMessage,
  workerCompletionOtpInvalidFormatMessage,
  workerCompletionOtpSuccessMessage,
  workerCompletionOtpTooManyAttemptsMessage,
} from "./worker-completion-messages";

export interface HandleWorkerMessageResult {
  handled: boolean;
  replied: boolean;
  error?: string;
}

async function getActiveOfferForWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<{
  id: string;
  service_request_id: string;
  status: string;
  expires_at: string;
} | null> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("worker_service_offers")
    .select("id, service_request_id, status, expires_at")
    .eq("worker_id", workerId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("offered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: String(data.id),
    service_request_id: String(data.service_request_id),
    status: String(data.status),
    expires_at: String(data.expires_at),
  };
}

async function handleWorkerCompletionOtpWhatsApp(
  supabase: SupabaseClient,
  worker: { id: string; mobile: string; lang: "mr" | "hi" | "en" },
  text: string,
): Promise<HandleWorkerMessageResult | null> {
  const otp = parseOtpFromText(text);
  if (!otp) return null;

  const pending = await getBookingPendingWorkerOtpVerification(supabase, worker.id);
  if (!pending) {
    const send = await sendWhatsAppText(
      worker.mobile,
      workerCompletionOtpInvalidFormatMessage(worker.lang),
    );
    return { handled: true, replied: send.ok };
  }

  const result = await executeWorkerCompletionOtpVerification(supabase, {
    bookingId: pending.bookingId,
    workerId: worker.id,
    rawOtp: otp,
  });

  if (result.ok) {
    const send = await sendWhatsAppText(worker.mobile, workerCompletionOtpSuccessMessage(worker.lang));
    return { handled: true, replied: send.ok };
  }

  let msg = workerCompletionOtpFailedMessage(worker.lang, result.attemptsRemaining ?? 0);
  if (result.error === "expired") msg = workerCompletionOtpExpiredMessage(worker.lang);
  if (result.error === "too_many_attempts") msg = workerCompletionOtpTooManyAttemptsMessage(worker.lang);

  const send = await sendWhatsAppText(worker.mobile, msg);
  return { handled: true, replied: send.ok, error: result.error };
}

/** Worker WhatsApp handler — must run BEFORE customer FSM. */
export async function handleWorkerWhatsAppMessage(
  supabase: SupabaseClient,
  input: { mobile: string; text: string; messageId: string },
): Promise<HandleWorkerMessageResult> {
  const mobile = normalizeWhatsAppMobile(input.mobile);
  const worker = await findWorkerByMobile(supabase, mobile);
  if (!worker) {
    return { handled: false, replied: false };
  }

  const choice = input.text.trim();
  const lang = worker.lang;

  // Completion OTP (6 digits) — worker enters OTP from customer
  const otpDigits = parseOtpFromText(choice);
  if (otpDigits) {
    const otpResult = await handleWorkerCompletionOtpWhatsApp(supabase, worker, choice);
    if (otpResult) return otpResult;
  }

  const active = await getActiveOfferForWorker(supabase, worker.id);
  if (!active) {
    return { handled: false, replied: false };
  }

  if (choice !== "1" && choice !== "2") {
    return { handled: false, replied: false };
  }

  if (choice === "1") {
    const result = await acceptWorkerOffer(supabase, {
      offerId: active.id,
      workerId: worker.id,
      channel: "whatsapp",
    });

    if (!result.ok) {
      const msg =
        result.error === "offer_expired"
          ? workerOfferExpiredMessage(lang)
          : workerOfferUnavailableMessage(lang);
      const send = await sendWhatsAppText(mobile, msg);
      return { handled: true, replied: send.ok, error: result.error };
    }

    await finalizeWorkerOfferAcceptance(supabase, result);
    const send = await sendWhatsAppText(mobile, workerOfferAcceptedMessage(lang));
    return { handled: true, replied: send.ok };
  }

  const rejectResult = await rejectWorkerOffer(supabase, {
    offerId: active.id,
    workerId: worker.id,
    channel: "whatsapp",
  });

  if (!rejectResult.ok) {
    const msg =
      rejectResult.error === "offer_expired"
        ? workerOfferExpiredMessage(lang)
        : workerOfferUnavailableMessage(lang);
    const send = await sendWhatsAppText(mobile, msg);
    return { handled: true, replied: send.ok, error: rejectResult.error };
  }

  const send = await sendWhatsAppText(mobile, workerOfferRejectedMessage(lang));
  return { handled: true, replied: send.ok };
}
