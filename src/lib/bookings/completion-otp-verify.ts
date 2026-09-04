import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import {
  parseOtpFromText,
  verifyCompletionOtp,
  type VerifyCompletionOtpError,
} from "@/lib/bookings/completion-otp";
import { getConversationForCustomer, updateConversation } from "@/lib/whatsapp/conversation";
import { normalizeWhatsAppMobile } from "@/lib/whatsapp/parser";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import {
  completionVerifiedMessage,
  paymentModeMenu,
} from "@/lib/whatsapp/completion-messages";

export interface WorkerVerifyCompletionOtpResult {
  ok: boolean;
  error?: VerifyCompletionOtpError;
  alreadyVerified?: boolean;
  attemptsRemaining?: number;
  customerNotified?: boolean;
  paymentUnlocked?: boolean;
}

async function syncCustomerPaymentSelectionConversation(
  supabase: SupabaseClient,
  input: { bookingId: string; customerId: string; mobile?: string },
): Promise<void> {
  const conv = await getConversationForCustomer(supabase, {
    mobile: input.mobile,
    customerId: input.customerId,
  });

  const now = new Date().toISOString();
  const nextContext = {
    ...((conv.data?.context as Record<string, unknown> | undefined) ?? {}),
    phase: "payment_selection",
    booking_id: input.bookingId,
    otp_verified_at: now,
  };

  if (conv.data) {
    await updateConversation(supabase, conv.data.id, {
      state: "service_completion",
      booking_id: input.bookingId,
      last_message_at: now,
      context: nextContext,
    });
  }

  const normalizedMobile = input.mobile ? normalizeWhatsAppMobile(input.mobile) : null;
  if (normalizedMobile) {
    await supabase
      .from("whatsapp_conversations")
      .update({
        state: "service_completion",
        booking_id: input.bookingId,
        last_message_at: now,
        context: nextContext,
        updated_at: now,
      })
      .eq("whatsapp_mobile", normalizedMobile);
  }

  await supabase
    .from("whatsapp_conversations")
    .update({
      state: "service_completion",
      booking_id: input.bookingId,
      last_message_at: now,
      context: nextContext,
      updated_at: now,
    })
    .eq("customer_id", input.customerId);
}

/** Worker submits completion OTP — unlocks customer payment selection on success. */
export async function executeWorkerCompletionOtpVerification(
  supabase: SupabaseClient,
  input: { bookingId: string; workerId: string; rawOtp: string },
): Promise<WorkerVerifyCompletionOtpResult> {
  const otp = parseOtpFromText(input.rawOtp.trim());
  if (!otp) {
    return { ok: false, error: "invalid_otp" };
  }

  const verified = await verifyCompletionOtp(supabase, {
    bookingId: input.bookingId,
    workerId: input.workerId,
    rawOtp: otp,
  });

  if (!verified.ok) {
    return {
      ok: false,
      error: verified.error,
      attemptsRemaining: verified.attemptsRemaining,
    };
  }

  const { data: booking } = await supabase
    .from("booking")
    .select("customer_id")
    .eq("id", input.bookingId)
    .maybeSingle();

  if (!booking?.customer_id) {
    return { ok: true, paymentUnlocked: true, customerNotified: false };
  }

  const customerId = String(booking.customer_id);

  const { data: customer } = await supabase
    .from("customers")
    .select("mobile, preferred_language")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer?.mobile) {
    return { ok: true, paymentUnlocked: true, customerNotified: false };
  }

  const mobile = String(customer.mobile);
  const lang = (customer.preferred_language === "en" ||
  customer.preferred_language === "hi" ||
  customer.preferred_language === "mr"
    ? customer.preferred_language
    : "mr") as CustomerPreferredLanguage;

  await syncCustomerPaymentSelectionConversation(supabase, {
    bookingId: input.bookingId,
    customerId,
    mobile,
  });

  if (verified.alreadyVerified) {
    return { ok: true, alreadyVerified: true, paymentUnlocked: true, customerNotified: false };
  }

  const body = `${completionVerifiedMessage(lang)}\n\n${paymentModeMenu(lang)}`;
  const send = await sendWhatsAppText(mobile, body);

  return {
    ok: true,
    alreadyVerified: false,
    paymentUnlocked: true,
    customerNotified: send.ok,
  };
}
