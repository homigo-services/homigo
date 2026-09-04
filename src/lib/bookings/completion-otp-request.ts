import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import {
  COMPLETION_OTP_MAX_ATTEMPTS,
  requestCompletionOtp,
  type RequestCompletionOtpResult,
} from "@/lib/bookings/completion-otp";
import { getConversationForCustomer, updateConversation } from "@/lib/whatsapp/conversation";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import { canExposeDevOtpInApi, isWhatsappMockSendEnabled } from "@/lib/env/runtime";
import { completionOtpCustomerMessage } from "@/lib/whatsapp/completion-messages";

export interface CompleteOtpRequestResult extends RequestCompletionOtpResult {
  messageSent?: boolean;
  /** Dev/mock only — never returned from production worker API. */
  devOtp?: string;
}

/** Worker requests completion OTP — updates booking + conversation + notifies customer. */
export async function executeCompletionOtpRequest(
  supabase: SupabaseClient,
  input: { bookingId: string; workerId: string },
  options?: { rawOtpForNotify?: string; lang?: CustomerPreferredLanguage },
): Promise<CompleteOtpRequestResult> {
  const result = await requestCompletionOtp(supabase, input);
  if (!result.ok || !result.customerMobile) {
    return result;
  }

  if (result.alreadySent) {
    return { ...result, messageSent: false };
  }

  const rawOtp = result.internalNotifyOtp;
  if (!rawOtp) {
    return { ...result, messageSent: false };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("preferred_language")
    .eq("mobile", result.customerMobile)
    .maybeSingle();

  const lang =
    options?.lang ??
    (customer?.preferred_language === "en" ||
    customer?.preferred_language === "mr" ||
    customer?.preferred_language === "hi"
      ? customer.preferred_language
      : "mr");

  const { data: bookingRow } = await supabase
    .from("booking")
    .select("customer_id")
    .eq("id", input.bookingId)
    .maybeSingle();

  const conv = await getConversationForCustomer(supabase, {
    mobile: result.customerMobile,
    customerId: bookingRow?.customer_id ? String(bookingRow.customer_id) : null,
  });
  if (conv.data) {
    await updateConversation(supabase, conv.data.id, {
      state: "service_completion",
      booking_id: input.bookingId,
      context: {
        ...(conv.data.context as Record<string, unknown>),
        phase: "otp_pending",
        booking_id: input.bookingId,
        ...(canExposeDevOtpInApi() && isWhatsappMockSendEnabled()
          ? { dev_completion_otp: rawOtp }
          : {}),
      },
    });
  }

  const body = completionOtpCustomerMessage(lang, rawOtp);
  const send = await sendWhatsAppText(result.customerMobile, body);

  return {
    ...result,
    ...(canExposeDevOtpInApi() && isWhatsappMockSendEnabled() ? { devOtp: rawOtp } : {}),
    messageSent: send.ok,
  };
}

export { COMPLETION_OTP_MAX_ATTEMPTS };
