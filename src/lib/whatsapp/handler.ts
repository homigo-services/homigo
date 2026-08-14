import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer } from "@/lib/customers/types";
import { sendWhatsAppText } from "./client";
import {
  handleBookingFlow,
  isBookingFlowState,
  sendPostLanguageServiceMenu,
  sendReturningCustomerServiceMenu,
} from "./booking-flow";
import {
  handleBookingConfirmedInbound,
  handlePaymentPendingInbound,
  handleServiceCompletionInbound,
  handleServiceInProgressInbound,
} from "./service-completion-flow";
import {
  type ConversationContext,
  ensureConversation,
  freshOnboardingContext,
  isConversationReady,
  markConversationReady,
  resetConversationForNewBooking,
  readyLanguageContext,
  updateConversation,
} from "./conversation";
import { upsertCustomerFromWhatsApp } from "./customer";
import { waDebug } from "./debug-log";
import {
  COMPLETED_BOOKING_NUDGE,
  INVALID_LANGUAGE_SELECTION,
  isValidPreferredLanguage,
  LANGUAGE_SELECTION_PROMPT,
  ONBOARDING_WELCOME_WITH_LANGUAGE,
  parseLanguageSelection,
  UNSUPPORTED_MESSAGE_TYPE,
} from "./messages";
import type { ParsedWhatsAppMessage } from "./parser";
import { isGreeting, normalizeWhatsAppMobile } from "./parser";
import { shouldSkipLanguageForReturningCustomer } from "./routing";
import type { WhatsappConversationState } from "./types";

export interface HandleMessageResult {
  handled: boolean;
  replied: boolean;
  error?: string;
}

async function saveCustomerLanguage(
  supabase: SupabaseClient,
  customerId: string,
  language: "en" | "mr" | "hi",
): Promise<string | null> {
  const { error } = await supabase
    .from("customers")
    .update({
      preferred_language: language,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  return error?.message ?? null;
}

function effectiveLanguage(customer: Customer): "en" | "mr" | "hi" {
  if (isValidPreferredLanguage(customer.preferred_language)) {
    return customer.preferred_language;
  }
  return "mr";
}

/** Greeting on completed state starts fresh onboarding instead of stale status replies. */
function shouldRestartOnboardingForGreeting(state: WhatsappConversationState): boolean {
  return state === "completed";
}

/** WhatsApp-created customer not yet through profile collection. */
function isIncompleteWhatsAppProfile(customer: Customer): boolean {
  return (
    customer.source === "whatsapp" &&
    customer.area === "pending" &&
    customer.pincode === "pending" &&
    customer.address_line === "pending"
  );
}

/**
 * Core WhatsApp conversation handler (Phase 3A language + Phase 4A booking).
 */
export async function handleIncomingTextMessage(
  supabase: SupabaseClient,
  message: ParsedWhatsAppMessage,
): Promise<HandleMessageResult> {
  const mobile = normalizeWhatsAppMobile(message.from);
  const text = message.textBody?.trim() ?? "";

  waDebug("IN", {
    messageId: message.messageId,
    mobile,
    actor: "customer",
    textPreview: text,
  });

  if (!message.messageId || !mobile) {
    return { handled: false, replied: false, error: "Invalid message metadata" };
  }

  const customerResult = await upsertCustomerFromWhatsApp(supabase, mobile);
  if (customerResult.error || !customerResult.customer) {
    console.error("[whatsapp] customer upsert failed:", customerResult.error);
    return {
      handled: false,
      replied: false,
      error: customerResult.error ?? "Customer upsert failed",
    };
  }

  const customer = customerResult.customer;
  const language = effectiveLanguage(customer);

  const convResult = await ensureConversation(
    supabase,
    mobile,
    customer.id,
    language,
  );
  if (convResult.error || !convResult.data) {
    console.error("[whatsapp] conversation ensure failed:", convResult.error);
    return {
      handled: false,
      replied: false,
      error: convResult.error ?? "Conversation ensure failed",
    };
  }

  let conversation = convResult.data;
  let ctx = conversation.context as ConversationContext;

  waDebug("STATE", {
    messageId: message.messageId,
    mobile,
    state: conversation.state,
    phase: String(ctx.phase ?? ""),
  });

  if (conversation.customer_id !== customer.id) {
    const linked = await updateConversation(supabase, conversation.id, {
      customer_id: customer.id,
    });
    if (linked.data) conversation = linked.data;
  }

  // Heal stale rows stuck outside language onboarding (never during active booking flow)
  if (
    isIncompleteWhatsAppProfile(customer) &&
    !isConversationReady(conversation) &&
    conversation.state !== "language_selection" &&
    !isBookingFlowState(conversation.state)
  ) {
    const reset = await updateConversation(supabase, conversation.id, {
      state: "language_selection",
      service_request_id: null,
      booking_id: null,
      context: freshOnboardingContext({
        whatsapp_onboarding_started: ctx.whatsapp_onboarding_started ?? false,
      }),
    });
    if (reset.data) {
      conversation = reset.data;
      ctx = conversation.context as ConversationContext;
    }
    waDebug("BRANCH", {
      messageId: message.messageId,
      mobile,
      branch: "heal_incomplete_profile",
      state: conversation.state,
    });
  }

  const lang = language;

  async function sendOnboardingWelcome(messageId: string): Promise<HandleMessageResult> {
    const send = await sendWhatsAppText(mobile, ONBOARDING_WELCOME_WITH_LANGUAGE);
    await updateConversation(supabase, conversation.id, {
      state: "language_selection",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: freshOnboardingContext(),
    });
    waDebug("OUT", {
      messageId,
      mobile,
      handler: "sendOnboardingWelcome",
      replied: send.ok,
    });
    return { handled: true, replied: send.ok };
  }

  // Greeting after completed booking — fresh onboarding (never during active matching)
  if (isGreeting(text) && shouldRestartOnboardingForGreeting(conversation.state)) {
    waDebug("BRANCH", {
      messageId: message.messageId,
      mobile,
      branch: "greeting_reset_completed",
    });
    const reset = await resetConversationForNewBooking(
      supabase,
      conversation,
      message.messageId,
    );
    if (reset.data) conversation = reset.data;
    return sendOnboardingWelcome(message.messageId);
  }

  // worker_assignment — always booking flow (matching retry); never onboarding fallback
  if (conversation.state === "worker_assignment") {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleBookingFlow",
      state: conversation.state,
    });
    return handleBookingFlow({
      supabase,
      customer,
      conversation,
      messageId: message.messageId,
      text,
      lang,
    });
  }

  // Finished booking — non-greeting status only (greeting handled above)
  if (conversation.state === "completed") {
    const send = await sendWhatsAppText(mobile, COMPLETED_BOOKING_NUDGE[lang]);
    await updateConversation(supabase, conversation.id, {
      last_message_id: message.messageId,
      last_message_at: new Date().toISOString(),
    });
    waDebug("OUT", {
      messageId: message.messageId,
      mobile,
      handler: "completed_nudge",
      replied: send.ok,
    });
    return { handled: true, replied: send.ok };
  }

  // Post-assignment: service completion OTP → payment selection / pending payment
  if (conversation.state === "payment_pending") {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handlePaymentPendingInbound",
    });
    return handlePaymentPendingInbound(
      supabase,
      conversation,
      mobile,
      lang,
      message.messageId,
    );
  }

  if (conversation.state === "service_completion") {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleServiceCompletionInbound",
    });
    return handleServiceCompletionInbound(
      supabase,
      conversation,
      mobile,
      lang,
      message.messageId,
      text,
    );
  }

  if (conversation.state === "service_in_progress") {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleServiceInProgressInbound",
    });
    return handleServiceInProgressInbound(
      supabase,
      conversation,
      mobile,
      lang,
      message.messageId,
      text,
    );
  }

  if (conversation.state === "booking_confirmed") {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleBookingConfirmedInbound",
    });
    return handleBookingConfirmedInbound(
      supabase,
      conversation,
      mobile,
      lang,
      message.messageId,
    );
  }

  // Phase 4A booking flow (service selection onward)
  if (isBookingFlowState(conversation.state)) {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleBookingFlow",
      state: conversation.state,
    });
    return handleBookingFlow({
      supabase,
      customer,
      conversation,
      messageId: message.messageId,
      text,
      lang,
    });
  }

  // WhatsApp onboarding — language selection flow (must run before returning-customer shortcut)
  if (conversation.state === "language_selection") {
    if (isGreeting(text)) {
      return sendOnboardingWelcome(message.messageId);
    }

    const selected = parseLanguageSelection(text);
    if (selected) {
      waDebug("BRANCH", {
        messageId: message.messageId,
        mobile,
        branch: "language_selected",
      });
      const langError = await saveCustomerLanguage(
        supabase,
        customer.id,
        selected,
      );
      if (langError) {
        console.error("[whatsapp] language save failed:", langError);
        return { handled: false, replied: false, error: langError };
      }

      const updated = await markConversationReady(
        supabase,
        conversation,
        selected,
        message.messageId,
      );
      if (updated.error) {
        return { handled: false, replied: false, error: updated.error };
      }

      return sendPostLanguageServiceMenu(
        supabase,
        customer,
        updated.data ?? conversation,
        selected,
        message.messageId,
      );
    }

    // Returning customer with completed language onboarding — skip language menu only when safe
    const isExistingProfileWithLanguage =
      !customerResult.created &&
      isValidPreferredLanguage(customer.preferred_language) &&
      !ctx.whatsapp_onboarding_started &&
      !isIncompleteWhatsAppProfile(customer);

    if (
      shouldSkipLanguageForReturningCustomer(
        conversation,
        ctx,
        text,
        parseLanguageSelection,
      )
    ) {
      waDebug("BRANCH", {
        messageId: message.messageId,
        mobile,
        branch: "returning_customer_skip_language",
      });

      if (isExistingProfileWithLanguage) {
        const ready = await markConversationReady(
          supabase,
          conversation,
          lang,
          message.messageId,
        );
        if (ready.data) conversation = ready.data;
      }

      return sendReturningCustomerServiceMenu(
        supabase,
        customer,
        conversation,
        lang,
        message.messageId,
        isGreeting(text),
      );
    }

    if (text.length > 0) {
      const send = await sendWhatsAppText(
        mobile,
        `${INVALID_LANGUAGE_SELECTION}\n\n${LANGUAGE_SELECTION_PROMPT}`,
      );
      await updateConversation(supabase, conversation.id, {
        state: "language_selection",
        last_message_id: message.messageId,
        last_message_at: new Date().toISOString(),
        context: freshOnboardingContext({
          whatsapp_onboarding_started: true,
        }),
      });
      waDebug("OUT", {
        messageId: message.messageId,
        mobile,
        handler: "invalid_language",
        replied: send.ok,
      });
      return { handled: true, replied: send.ok };
    }
  }

  waDebug("BRANCH", {
    messageId: message.messageId,
    mobile,
    branch: "fallback_onboarding",
    state: conversation.state,
  });
  return sendOnboardingWelcome(message.messageId);
}

export async function handleUnsupportedMessageType(
  mobile: string,
): Promise<HandleMessageResult> {
  const send = await sendWhatsAppText(
    normalizeWhatsAppMobile(mobile),
    UNSUPPORTED_MESSAGE_TYPE,
  );
  return { handled: true, replied: send.ok };
}
