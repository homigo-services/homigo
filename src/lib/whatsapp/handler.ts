import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer } from "@/lib/customers/types";
import { sendWhatsAppText } from "./client";
import {
  handleBookingFlow,
  isBookingFlowState,
  logConversationStateAfter,
  sendPostLanguageServiceMenu,
  sendReturningCustomerServiceMenu,
} from "./booking-flow";
import {
  handleBookingConfirmedInbound,
  handlePaymentPendingInbound,
  handlePaymentSelectionInbound,
  handleServiceCompletionInbound,
  handleServiceInProgressInbound,
} from "./service-completion-flow";
import { buildFreshOnboardingContext } from "./context-builders";
import { withConversationLock } from "./conversation-lock";
import {
  type ConversationContext,
  ensureConversation,
  freshOnboardingContext,
  isConversationReady,
  markConversationReady,
  refreshConversation,
  resetConversationForNewBooking,
  updateConversation,
} from "./conversation";
import { upsertCustomerFromWhatsApp } from "./customer";
import { waContextSnapshot, waDebug } from "./debug-log";
import {
  conversationNeedsBookingHeal,
  isOrphanConversationState,
  shouldResetOnboardingGreeting,
} from "./fsm-guards";
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
import { applyConversationInactivityIfNeeded } from "./conversation-inactivity";
import { shouldSkipLanguageForReturningCustomer, customerStateUsesNumericMenu } from "./routing";
import type { WhatsappConversation, WhatsappConversationState } from "./types";

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

function shouldRestartOnboardingForGreeting(state: WhatsappConversationState): boolean {
  return state === "completed";
}

function isIncompleteWhatsAppProfile(customer: Customer): boolean {
  return (
    customer.source === "whatsapp" &&
    customer.area === "pending" &&
    customer.pincode === "pending" &&
    customer.address_line === "pending"
  );
}

async function healConversationRow(
  supabase: SupabaseClient,
  conversation: { id: string; state: WhatsappConversationState },
  messageId: string,
  reason: string,
) {
  waDebug("BRANCH", {
    messageId,
    branch: reason,
    state: conversation.state,
  });

  const reset = await updateConversation(supabase, conversation.id, {
    state: "language_selection",
    service_request_id: null,
    booking_id: null,
    context: freshOnboardingContext({
      whatsapp_onboarding_started: false,
    }),
  });

  return reset.data;
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

  return withConversationLock(
    supabase,
    mobile,
    message.messageId,
    () =>
      processIncomingTextMessage(
        supabase,
        message,
        mobile,
        customer,
        customerResult.created,
        language,
        convResult.data!,
      ),
  );
}

async function processIncomingTextMessage(
  supabase: SupabaseClient,
  message: ParsedWhatsAppMessage,
  mobile: string,
  customer: Customer,
  customerCreated: boolean,
  language: "en" | "mr" | "hi",
  initialConversation: WhatsappConversation,
): Promise<HandleMessageResult> {
  const text = message.textBody?.trim() ?? "";

  const refreshed = await refreshConversation(supabase, initialConversation.id);
  let conversation: WhatsappConversation = refreshed.data ?? initialConversation;
  if (!conversation) {
    return { handled: false, replied: false, error: "Conversation not found after refresh" };
  }

  let ctx = conversation.context as ConversationContext;

  waDebug("STATE", {
    messageId: message.messageId,
    mobile,
    stateBefore: conversation.state,
    phase: String(ctx.phase ?? ""),
    contextSummary: waContextSnapshot(ctx),
    collecting_field: String(ctx.collecting_field ?? ""),
    service_id: String(ctx.service_id ?? ""),
    service_date: String(ctx.service_date ?? ""),
  });

  if (conversation.customer_id !== customer.id) {
    const linked = await updateConversation(supabase, conversation.id, {
      customer_id: customer.id,
    });
    if (linked.data) conversation = linked.data;
  }

  // Worker offer accept/reject — never steal customer payment menu "1"/"2"
  if (
    (text === "1" || text === "2") &&
    !customerStateUsesNumericMenu(conversation.state, ctx)
  ) {
    const { handleWorkerWhatsAppMessage } = await import("@/lib/workers/worker-whatsapp");
    const workerResult = await handleWorkerWhatsAppMessage(supabase, {
      mobile,
      text,
      messageId: message.messageId,
    });
    if (workerResult.handled) {
      return workerResult;
    }
  }

  // 24h customer inactivity — reset stale conversational FSM (bookings untouched)
  const inactivity = await applyConversationInactivityIfNeeded(
    supabase,
    conversation,
    mobile,
    message.messageId,
  );
  if (inactivity.conversation) {
    conversation = inactivity.conversation;
    ctx = conversation.context as ConversationContext;
  }
  if (inactivity.didReset) {
    waDebug("BRANCH", {
      messageId: message.messageId,
      mobile,
      branch: "inactivity_reset",
      state: conversation.state,
    });
  }

  // Heal corrupted booking step or orphan DB state before routing
  if (
    isOrphanConversationState(conversation.state) ||
    conversationNeedsBookingHeal(conversation.state, ctx)
  ) {
    const healed = await healConversationRow(
      supabase,
      conversation,
      message.messageId,
      isOrphanConversationState(conversation.state)
        ? "heal_orphan_state"
        : "heal_corrupt_booking_state",
    );
    if (healed) {
      conversation = healed;
      ctx = conversation.context as ConversationContext;
    }
  } else if (
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
  const conversationId = conversation.id;

  async function sendOnboardingWelcome(messageId: string): Promise<HandleMessageResult> {
    await updateConversation(supabase, conversation.id, {
      state: "language_selection",
      service_request_id: null,
      booking_id: null,
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: buildFreshOnboardingContext({ whatsapp_onboarding_started: true }),
    });
    const send = await sendWhatsAppText(mobile, ONBOARDING_WELCOME_WITH_LANGUAGE);
    waDebug("OUT", {
      messageId,
      mobile,
      handler: "sendOnboardingWelcome",
      replied: send.ok,
    });
    await logConversationStateAfter(supabase, conversationId, mobile, messageId);
    return { handled: true, replied: send.ok };
  }

  async function finish(result: HandleMessageResult): Promise<HandleMessageResult> {
    await logConversationStateAfter(supabase, conversationId, mobile, message.messageId);
    return result;
  }

  // Completed booking + greeting → fresh onboarding
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
    return finish(await sendOnboardingWelcome(message.messageId));
  }

  // Greeting during pre-worker booking states → always restart language onboarding
  if (isGreeting(text) && shouldResetOnboardingGreeting(conversation.state)) {
    waDebug("BRANCH", {
      messageId: message.messageId,
      mobile,
      branch: "greeting_reset_booking_state",
      state: conversation.state,
    });
    const reset = await resetConversationForNewBooking(
      supabase,
      conversation,
      message.messageId,
    );
    if (reset.data) conversation = reset.data;
    return finish(await sendOnboardingWelcome(message.messageId));
  }

  // worker_assignment — always booking flow; never reset on greeting
  if (conversation.state === "worker_assignment") {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleBookingFlow",
      state: conversation.state,
    });
    return finish(
      await handleBookingFlow({
        supabase,
        customer,
        conversation,
        messageId: message.messageId,
        text,
        lang,
      }),
    );
  }

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
    return finish({ handled: true, replied: send.ok });
  }

  if (conversation.state === "payment_pending") {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handlePaymentPendingInbound",
    });
    return finish(
      await handlePaymentPendingInbound(
        supabase,
        conversation,
        mobile,
        lang,
        message.messageId,
      ),
    );
  }

  if (conversation.state === "service_completion") {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleServiceCompletionInbound",
    });
    return finish(
      await handleServiceCompletionInbound(
        supabase,
        conversation,
        mobile,
        lang,
        message.messageId,
        text,
      ),
    );
  }

  if (conversation.state === "service_in_progress") {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleServiceInProgressInbound",
    });
    return finish(
      await handleServiceInProgressInbound(
        supabase,
        conversation,
        mobile,
        lang,
        message.messageId,
        text,
      ),
    );
  }

  if (conversation.state === "booking_confirmed") {
    const bookingId =
      conversation.booking_id ??
      ((conversation.context as ConversationContext).booking_id as string | undefined);

    if (bookingId) {
      const { data: bookingRow } = await supabase
        .from("booking")
        .select("otp_verified, completion_otp_hash")
        .eq("id", bookingId)
        .maybeSingle();

      if (bookingRow?.otp_verified) {
        const ctx = conversation.context as ConversationContext;
        const synced = await updateConversation(supabase, conversation.id, {
          state: "service_completion",
          booking_id: bookingId,
          context: { ...ctx, phase: "payment_selection", booking_id: bookingId },
        });
        return finish(
          await handlePaymentSelectionInbound(
            supabase,
            synced.data ?? conversation,
            mobile,
            lang,
            message.messageId,
            text,
          ),
        );
      }

      if (bookingRow?.completion_otp_hash && !bookingRow.otp_verified) {
        const ctx = conversation.context as ConversationContext;
        const synced = await updateConversation(supabase, conversation.id, {
          state: "service_completion",
          booking_id: bookingId,
          context: { ...ctx, phase: "otp_pending", booking_id: bookingId },
        });
        return finish(
          await handleServiceCompletionInbound(
            supabase,
            synced.data ?? conversation,
            mobile,
            lang,
            message.messageId,
            text,
          ),
        );
      }
    }

    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleBookingConfirmedInbound",
    });
    return finish(
      await handleBookingConfirmedInbound(
        supabase,
        conversation,
        mobile,
        lang,
        message.messageId,
      ),
    );
  }

  if (isBookingFlowState(conversation.state)) {
    waDebug("ROUTE", {
      messageId: message.messageId,
      mobile,
      handler: "handleBookingFlow",
      state: conversation.state,
    });
    return finish(
      await handleBookingFlow({
        supabase,
        customer,
        conversation,
        messageId: message.messageId,
        text,
        lang,
      }),
    );
  }

  if (conversation.state === "language_selection") {
    if (isGreeting(text)) {
      return finish(await sendOnboardingWelcome(message.messageId));
    }

    const selected = parseLanguageSelection(text);
    if (selected) {
      waDebug("BRANCH", {
        messageId: message.messageId,
        mobile,
        branch: "language_selected",
      });
      const langError = await saveCustomerLanguage(supabase, customer.id, selected);
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

      return finish(
        await sendPostLanguageServiceMenu(
          supabase,
          customer,
          updated.data ?? conversation,
          selected,
          message.messageId,
        ),
      );
    }

    const isExistingProfileWithLanguage =
      !customerCreated &&
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

      return finish(
        await sendReturningCustomerServiceMenu(
          supabase,
          customer,
          conversation,
          lang,
          message.messageId,
          isGreeting(text),
        ),
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
      return finish({ handled: true, replied: send.ok });
    }
  }

  waDebug("BRANCH", {
    messageId: message.messageId,
    mobile,
    branch: "fallback_onboarding",
    state: conversation.state,
  });
  return finish(await sendOnboardingWelcome(message.messageId));
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
