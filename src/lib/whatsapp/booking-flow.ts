import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveRateCard } from "@/lib/bookings/rate-card";
import { getRateCardById } from "@/lib/rate-cards/queries";
import type { Customer } from "@/lib/customers/types";
import {
  createServiceRequest,
  updateRateCardAccepted,
  updateRateCardSent,
  updateServiceRequestStatus,
} from "@/lib/service-requests/queries";
import { sendWhatsAppText } from "./client";
import {
  buildAddressConfirmationContext,
  buildAwaitingCustomDateContext,
  buildDateSelectionContext,
  buildDetailsCollectionContext,
  buildRateRejectContext,
  buildServiceMenuContext,
  buildServiceSelectedContext,
  buildSlotSelectionContext,
  hasValidBookingServiceContext,
} from "./context-builders";
import {
  COLLECT_ADDRESS,
  COLLECT_AREA,
  COLLECT_PINCODE,
  CUSTOM_DATE_INSTRUCTION,
  dateSelectionPrompt,
  GENERIC_ERROR,
  INVALID_ADDRESS_CONFIRM_REPLY,
  INVALID_DATE,
  INVALID_PINCODE,
  INVALID_RATE_CARD_REPLY,
  INVALID_SERVICE_SELECTION,
  INVALID_SLOT,
  languageConfirmationWithMenu,
  returningCustomerGreetingWithMenu,
  PRICING_UNAVAILABLE,
  rateCardQuoteMessage,
  RATE_CARD_ACCEPTED,
  RATE_CARD_REJECTED,
  savedAddressConfirmationMessage,
  slotSelectionPrompt,
  WORKER_MATCHING_PENDING,
} from "./booking-messages";
import {
  type ConversationContext,
  refreshConversation,
  updateConversation,
} from "./conversation";
import { waContextSnapshot, waDebug } from "./debug-log";
import {
  loadServiceMenu,
  resolveServiceFromMenu,
  type ServiceMenuEntry,
} from "./service-menu";
import {
  isCustomDateMenuChoice,
  isPastDate,
  parseBookingDateSelection,
  parseSlotSelection,
} from "./slots";
import type { WhatsappConversation, WhatsappConversationState } from "./types";
import type { HandleMessageResult } from "./handler";
import { getBatchStatus } from "@/lib/workers/matching";
import { startWorkerMatchingWithNotifications } from "@/lib/workers/batch-matching";
import { WORKER_NOT_FOUND_CUSTOMER } from "@/lib/workers/worker-messages";
import { LANGUAGE_CONFIRMATION, ONBOARDING_WELCOME_WITH_LANGUAGE } from "./messages";
import { buildFreshOnboardingContext } from "./context-builders";
import { resetConversationForNewBooking } from "./conversation";
import { isGreeting } from "./parser";

type Lang = "en" | "mr" | "hi";
type CollectingField = "area" | "pincode" | "address_line";

const BOOKING_FLOW_STATES: WhatsappConversationState[] = [
  "service_selection",
  "address_collection",
  "pincode_collection",
  "date_selection",
  "slot_selection",
  "rate_card_confirmation",
  "worker_assignment",
];

export function isBookingFlowState(state: WhatsappConversationState): boolean {
  return BOOKING_FLOW_STATES.includes(state);
}

interface BookingFlowInput {
  supabase: SupabaseClient;
  customer: Customer;
  conversation: WhatsappConversation;
  messageId: string;
  text: string;
  lang: Lang;
}

function ctxOf(conversation: WhatsappConversation): ConversationContext {
  return conversation.context as ConversationContext;
}

function isPendingValue(value: string | null | undefined): boolean {
  return !value?.trim() || value.trim() === "pending";
}

function getMissingFields(customer: Customer): CollectingField[] {
  const missing: CollectingField[] = [];
  if (isPendingValue(customer.area)) missing.push("area");
  if (isPendingValue(customer.pincode)) missing.push("pincode");
  if (isPendingValue(customer.address_line)) missing.push("address_line");
  return missing;
}

function stateForField(field: CollectingField): WhatsappConversationState {
  return field === "pincode" ? "pincode_collection" : "address_collection";
}

function promptForField(field: CollectingField, lang: Lang): string {
  if (field === "area") return COLLECT_AREA[lang];
  if (field === "pincode") return COLLECT_PINCODE[lang];
  return COLLECT_ADDRESS[lang];
}

function inferCollectingField(
  state: WhatsappConversationState,
  customer: Customer,
  ctx: ConversationContext,
): CollectingField | undefined {
  if (ctx.collecting_field) return ctx.collecting_field as CollectingField;
  if (state === "pincode_collection") return "pincode";
  if (state === "address_collection") {
    const missing = getMissingFields(customer);
    return missing[0];
  }
  return undefined;
}

async function refreshCustomer(
  supabase: SupabaseClient,
  customerId: string,
): Promise<Customer | null> {
  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();
  return data as Customer | null;
}

async function saveCustomerField(
  supabase: SupabaseClient,
  customerId: string,
  field: CollectingField,
  value: string,
): Promise<string | null> {
  const { error } = await supabase
    .from("customers")
    .update({ [field]: value.trim(), updated_at: new Date().toISOString() })
    .eq("id", customerId);
  return error?.message ?? null;
}

async function patchConversation(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  patch: Parameters<typeof updateConversation>[2],
): Promise<WhatsappConversation | null> {
  const result = await updateConversation(supabase, conversation.id, patch);
  return result.data;
}

async function resolveBookingServiceId(
  supabase: SupabaseClient,
  ctx: ConversationContext,
): Promise<string | undefined> {
  if (ctx.service_id) return String(ctx.service_id);
  if (!ctx.rate_card_id) return undefined;
  const card = await getRateCardById(supabase, String(ctx.rate_card_id));
  return card.data?.service_id;
}

function menuFromContext(ctx: ConversationContext): ServiceMenuEntry[] {
  const raw = ctx.service_menu;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is ServiceMenuEntry =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as ServiceMenuEntry).id === "string" &&
      typeof (e as ServiceMenuEntry).index === "number",
  );
}

async function recoverToLanguageOnboarding(
  input: BookingFlowInput,
  reason: string,
): Promise<HandleMessageResult> {
  waDebug("BRANCH", {
    messageId: input.messageId,
    mobile: input.customer.mobile,
    branch: "recover_to_language_onboarding",
    error: reason,
  });

  await resetConversationForNewBooking(
    input.supabase,
    input.conversation,
    input.messageId,
  );
  await patchConversation(input.supabase, input.conversation, {
    context: buildFreshOnboardingContext({ whatsapp_onboarding_started: true }),
  });
  const send = await sendWhatsAppText(
    input.customer.mobile,
    ONBOARDING_WELCOME_WITH_LANGUAGE,
  );
  return { handled: true, replied: send.ok };
}

async function recoverToServiceSelection(
  input: BookingFlowInput,
  reason: string,
): Promise<HandleMessageResult> {
  waDebug("BRANCH", {
    messageId: input.messageId,
    mobile: input.customer.mobile,
    branch: "recover_to_service_selection",
    error: reason,
  });

  const menuResult = await loadServiceMenu(input.supabase, input.lang);
  if (menuResult.error) {
    const send = await sendWhatsAppText(input.customer.mobile, GENERIC_ERROR[input.lang]);
    return { handled: true, replied: send.ok, error: menuResult.error };
  }

  const send = await sendWhatsAppText(input.customer.mobile, menuResult.body);
  const ctx = ctxOf(input.conversation);
  await patchConversation(input.supabase, input.conversation, {
    state: "service_selection",
    service_request_id: null,
    booking_id: null,
    last_message_id: input.messageId,
    last_message_at: new Date().toISOString(),
    context: buildServiceMenuContext(
      input.lang,
      menuResult.menu,
      ctx.whatsapp_onboarding_started,
    ),
  });
  return { handled: true, replied: send.ok };
}

async function enterDateSelection(
  input: BookingFlowInput,
  ctx: ConversationContext,
): Promise<HandleMessageResult> {
  if (!hasValidBookingServiceContext(ctx)) {
    return recoverToServiceSelection(input, "missing_service_context_for_date");
  }

  const freshCustomer =
    (await refreshCustomer(input.supabase, input.customer.id)) ?? input.customer;
  if (getMissingFields(freshCustomer).length > 0) {
    return beginProfileCollectionAfterService(input, freshCustomer, ctx);
  }

  const send = await sendWhatsAppText(
    input.customer.mobile,
    dateSelectionPrompt(input.lang),
  );
  await patchConversation(input.supabase, input.conversation, {
    state: "date_selection",
    last_message_id: input.messageId,
    last_message_at: new Date().toISOString(),
    context: buildDateSelectionContext(ctx),
  });
  return { handled: true, replied: send.ok };
}

async function beginProfileCollectionAfterService(
  input: BookingFlowInput,
  customer: Customer,
  ctx: ConversationContext,
  source: "service_selection" | "field_saved" = "service_selection",
): Promise<HandleMessageResult> {
  if (!hasValidBookingServiceContext(ctx)) {
    return recoverToServiceSelection(input, "missing_service_context_after_select");
  }

  const missing = getMissingFields(customer);
  if (missing.length === 0) {
    if (source === "field_saved") {
      return enterDateSelection(input, ctx);
    }

    const body = savedAddressConfirmationMessage(input.lang, {
      area: customer.area,
      pincode: customer.pincode,
      addressLine: customer.address_line,
    });
    const send = await sendWhatsAppText(input.customer.mobile, body);
    await patchConversation(input.supabase, input.conversation, {
      state: "address_collection",
      last_message_id: input.messageId,
      last_message_at: new Date().toISOString(),
      context: buildAddressConfirmationContext({
        base: ctx,
        area: customer.area,
        pincode: customer.pincode,
        addressLine: customer.address_line,
      }),
    });
    return { handled: true, replied: send.ok };
  }

  const field = missing[0];
  const send = await sendWhatsAppText(
    input.customer.mobile,
    promptForField(field, input.lang),
  );
  await patchConversation(input.supabase, input.conversation, {
    state: stateForField(field),
    last_message_id: input.messageId,
    last_message_at: new Date().toISOString(),
    context: buildDetailsCollectionContext({ base: ctx, collectingField: field }),
  });
  return { handled: true, replied: send.ok };
}

async function handleSavedAddressConfirmation(
  input: BookingFlowInput,
  ctx: ConversationContext,
): Promise<HandleMessageResult> {
  const choice = input.text.trim();
  if (choice === "1") {
    return enterDateSelection(input, ctx);
  }
  if (choice === "2") {
    const send = await sendWhatsAppText(
      input.customer.mobile,
      promptForField("area", input.lang),
    );
    await patchConversation(input.supabase, input.conversation, {
      state: "address_collection",
      last_message_id: input.messageId,
      last_message_at: new Date().toISOString(),
      context: buildDetailsCollectionContext({ base: ctx, collectingField: "area" }),
    });
    return { handled: true, replied: send.ok };
  }

  const send = await sendWhatsAppText(
    input.customer.mobile,
    INVALID_ADDRESS_CONFIRM_REPLY[input.lang],
  );
  return { handled: true, replied: send.ok };
}

async function handleServiceSelection(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, text, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);
  const menu = menuFromContext(ctx);

  if (menu.length === 0) {
    const menuResult = await loadServiceMenu(supabase, lang);
    if (menuResult.error) {
      const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
      return { handled: true, replied: send.ok, error: menuResult.error };
    }
    const send = await sendWhatsAppText(customer.mobile, menuResult.body);
    await patchConversation(supabase, conversation, {
      state: "service_selection",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: buildServiceMenuContext(lang, menuResult.menu, ctx.whatsapp_onboarding_started),
    });
    return { handled: true, replied: send.ok };
  }

  const selected = resolveServiceFromMenu(text, menu);
  if (!selected) {
    const menuResult = await loadServiceMenu(supabase, lang);
    if (menuResult.error) {
      const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
      return { handled: true, replied: send.ok, error: menuResult.error };
    }
    const body = `${INVALID_SERVICE_SELECTION[lang]}\n\n${menuResult.body}`;
    const send = await sendWhatsAppText(customer.mobile, body);
    await patchConversation(supabase, conversation, {
      state: "service_selection",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: buildServiceMenuContext(lang, menuResult.menu, ctx.whatsapp_onboarding_started),
    });
    return { handled: true, replied: send.ok };
  }

  const serviceCtx = buildServiceSelectedContext({
    serviceId: selected.id,
    serviceName: selected.name,
    originalMessage: text,
    languageConfirmedAt: ctx.language_confirmed_at,
    whatsappOnboardingStarted: ctx.whatsapp_onboarding_started,
  });

  const patched = await patchConversation(supabase, conversation, {
    context: serviceCtx,
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
  });

  const freshCustomer = (await refreshCustomer(supabase, customer.id)) ?? customer;
  return beginProfileCollectionAfterService(
    { ...input, conversation: patched ?? conversation },
    freshCustomer,
    serviceCtx,
  );
}

async function handleDetailsCollection(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, text, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);

  if (ctx.phase === "confirm_saved_address") {
    return handleSavedAddressConfirmation(input, ctx);
  }

  const freshCustomer = (await refreshCustomer(supabase, customer.id)) ?? customer;
  const field = inferCollectingField(conversation.state, freshCustomer, ctx);

  if (!field) {
    return beginProfileCollectionAfterService(input, freshCustomer, ctx);
  }

  const value = text.trim();
  if (!value) {
    const send = await sendWhatsAppText(
      customer.mobile,
      promptForField(field, lang),
    );
    return { handled: true, replied: send.ok };
  }

  if (field === "pincode" && !/^\d{6}$/.test(value)) {
    const send = await sendWhatsAppText(customer.mobile, INVALID_PINCODE[lang]);
    return { handled: true, replied: send.ok };
  }

  const saveError = await saveCustomerField(supabase, customer.id, field, value);
  if (saveError) {
    console.error("[whatsapp] customer field save failed:", saveError);
    const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
    return { handled: true, replied: send.ok, error: saveError };
  }

  const updatedCustomer = (await refreshCustomer(supabase, customer.id)) ?? freshCustomer;
  return beginProfileCollectionAfterService(input, updatedCustomer, ctx, "field_saved");
}

async function handleDateSelection(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, text, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);
  const trimmed = text.trim();

  waDebug("DATE", {
    messageId,
    mobile: customer.mobile,
    textPreview: trimmed,
    state: conversation.state,
    phase: String(ctx.phase ?? ""),
    collecting_field: String(ctx.collecting_field ?? ""),
    service_id: String(ctx.service_id ?? ""),
    service_request_id: String(ctx.service_request_id ?? ""),
    service_date: String(ctx.service_date ?? ""),
  });

  if (!hasValidBookingServiceContext(ctx)) {
    return recoverToServiceSelection(input, "invalid_date_selection_context");
  }

  if (isGreeting(trimmed)) {
    return recoverToLanguageOnboarding(input, "greeting_at_date_selection");
  }

  if (!ctx.awaiting_custom_date && isCustomDateMenuChoice(trimmed)) {
    const send = await sendWhatsAppText(customer.mobile, CUSTOM_DATE_INSTRUCTION[lang]);
    await patchConversation(supabase, conversation, {
      state: "date_selection",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: buildAwaitingCustomDateContext(ctx),
    });
    return { handled: true, replied: send.ok };
  }

  const isoDate = parseBookingDateSelection(trimmed);

  waDebug("DATE", {
    messageId,
    mobile: customer.mobile,
    textPreview: trimmed,
    state: conversation.state,
    phase: String(ctx.phase ?? ""),
    collecting_field: String(ctx.collecting_field ?? ""),
    service_id: String(ctx.service_id ?? ""),
    parsed_date: isoDate ?? "null",
    is_past: isoDate ? isPastDate(isoDate) : true,
  });

  if (!isoDate) {
    const looksLikeDate = /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(trimmed);
    const body = looksLikeDate
      ? `${INVALID_DATE[lang]}\n\n${dateSelectionPrompt(lang)}`
      : `${INVALID_DATE[lang]}\n\n${dateSelectionPrompt(lang)}`;
    const send = await sendWhatsAppText(customer.mobile, body);
    await patchConversation(supabase, conversation, {
      state: "date_selection",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: buildDateSelectionContext(ctx),
    });
    return { handled: true, replied: send.ok };
  }

  const send = await sendWhatsAppText(customer.mobile, slotSelectionPrompt(lang));
  await patchConversation(supabase, conversation, {
    state: "slot_selection",
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: buildSlotSelectionContext(ctx, isoDate),
  });
  return { handled: true, replied: send.ok };
}

async function handleSlotSelection(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, text, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);

  if (!hasValidBookingServiceContext(ctx)) {
    return recoverToServiceSelection(input, "invalid_slot_selection_context");
  }

  if (isGreeting(text.trim())) {
    return recoverToLanguageOnboarding(input, "greeting_at_slot_selection");
  }

  const slot = parseSlotSelection(text);
  if (!slot) {
    const send = await sendWhatsAppText(
      customer.mobile,
      `${INVALID_SLOT[lang]}\n\n${slotSelectionPrompt(lang)}`,
    );
    return { handled: true, replied: send.ok };
  }

  const serviceId = String(ctx.service_id ?? "");
  const serviceName = String(ctx.service_name ?? "Service");
  const serviceDate = String(ctx.service_date ?? "");

  if (!serviceDate) {
    return enterDateSelection(input, ctx);
  }

  const freshCustomer = (await refreshCustomer(supabase, customer.id)) ?? customer;

  const srResult = await createServiceRequest(supabase, {
    original_message: String(ctx.original_message ?? text),
    service_type: serviceName,
    preferred_time_slot: slot.value,
    area: freshCustomer.area,
    pincode: freshCustomer.pincode,
    address: freshCustomer.address_line,
    service_date: serviceDate,
    customer_id: freshCustomer.id,
    customer_mobile: freshCustomer.mobile,
    status: "new",
    rate_card_sent: false,
    rate_card_accepted: false,
  });

  if (srResult.error || !srResult.data) {
    console.error("[whatsapp] service request create failed:", srResult.error);
    const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
    return { handled: true, replied: send.ok, error: srResult.error ?? undefined };
  }

  const rateResult = await getActiveRateCard(supabase, serviceId, serviceDate);

  if (rateResult.error) {
    console.error("[whatsapp] rate card lookup failed:", rateResult.error);
    const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
    return { handled: true, replied: send.ok, error: rateResult.error };
  }

  if (!rateResult.card || !rateResult.amounts) {
    const menuResult = await loadServiceMenu(supabase, lang);
    const menu = menuResult.menu.length > 0 ? menuResult.menu : menuFromContext(ctx);
    const send = await sendWhatsAppText(customer.mobile, PRICING_UNAVAILABLE[lang]);
    await patchConversation(supabase, conversation, {
      state: "service_selection",
      service_request_id: srResult.data.id,
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: {
        ...buildServiceMenuContext(lang, menu, ctx.whatsapp_onboarding_started),
        phase: "rate_unavailable",
        preferred_time_slot: slot.value,
        service_date: serviceDate,
        service_id: serviceId,
        service_name: serviceName,
      },
    });
    return { handled: true, replied: send.ok };
  }

  const quote = rateCardQuoteMessage(
    lang,
    serviceName,
    serviceDate,
    slot.value,
    rateResult.amounts,
  );
  const send = await sendWhatsAppText(customer.mobile, quote);

  await updateRateCardSent(supabase, srResult.data.id, true);

  await patchConversation(supabase, conversation, {
    state: "rate_card_confirmation",
    service_request_id: srResult.data.id,
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: {
      ...buildSlotSelectionContext(ctx, serviceDate),
      phase: "awaiting_rate_confirmation",
      preferred_time_slot: slot.value,
      service_request_id: srResult.data.id,
      rate_card_id: rateResult.card.id,
    },
  });

  return { handled: true, replied: send.ok };
}

async function handleRateCardConfirmation(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, text, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);
  const serviceRequestId = String(
    ctx.service_request_id ?? conversation.service_request_id ?? "",
  );

  const choice = text.trim();
  if (choice === "1") {
    if (serviceRequestId) {
      await updateRateCardAccepted(supabase, serviceRequestId, true);
      await updateRateCardSent(supabase, serviceRequestId, true);
    }

    let matchingMessage = RATE_CARD_ACCEPTED[lang];

    if (serviceRequestId) {
      const { data: sr } = await supabase
        .from("service-request")
        .select("service_type, area, pincode")
        .eq("id", serviceRequestId)
        .maybeSingle();

      const serviceId = await resolveBookingServiceId(supabase, ctx);

      const matching = await startWorkerMatchingWithNotifications(supabase, {
        serviceRequestId,
        serviceId,
        serviceType: sr?.service_type ? String(sr.service_type) : undefined,
        area: sr?.area ? String(sr.area) : customer.area,
        pincode: sr?.pincode ? String(sr.pincode) : customer.pincode,
      });

      if (matching.error) {
        console.error("[whatsapp] worker matching failed:", matching.error);
      }

      if (matching.noMoreWorkers || matching.batch.status === "no_workers") {
        matchingMessage = WORKER_NOT_FOUND_CUSTOMER[lang];
      } else {
        matchingMessage = RATE_CARD_ACCEPTED[lang];
      }

      await patchConversation(supabase, conversation, {
        state: "worker_assignment",
        last_message_id: messageId,
        last_message_at: new Date().toISOString(),
        context: {
          ...ctx,
          phase: "worker_matching_pending",
          matching_batch: 1,
          matching_status: matching.batch.status,
          offer_count: matching.batch.offerCount,
          service_request_id: serviceRequestId,
          ...(matching.devAcceptLinks.length > 0
            ? { dev_accept_links: matching.devAcceptLinks }
            : {}),
        },
      });

      const send = await sendWhatsAppText(customer.mobile, matchingMessage);
      return { handled: true, replied: send.ok };
    }

    const send = await sendWhatsAppText(customer.mobile, matchingMessage);
    await patchConversation(supabase, conversation, {
      state: "worker_assignment",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: { ...ctx, phase: "worker_matching_pending" },
    });
    return { handled: true, replied: send.ok };
  }

  if (choice === "2") {
    if (serviceRequestId) {
      await updateRateCardAccepted(supabase, serviceRequestId, false);
      await updateServiceRequestStatus(supabase, serviceRequestId, "cancelled");
    }

    const send = await sendWhatsAppText(customer.mobile, RATE_CARD_REJECTED[lang]);
    await patchConversation(supabase, conversation, {
      state: "service_selection",
      service_request_id: null,
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: buildRateRejectContext(ctx),
    });
    return { handled: true, replied: send.ok };
  }

  const send = await sendWhatsAppText(customer.mobile, INVALID_RATE_CARD_REPLY[lang]);
  return { handled: true, replied: send.ok };
}

async function handleWorkerAssignment(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);
  const serviceRequestId = String(
    ctx.service_request_id ?? conversation.service_request_id ?? "",
  );

  if (serviceRequestId) {
    const batch = await getBatchStatus(supabase, serviceRequestId, 1);
    const retryCondition =
      !batch.error &&
      batch.data.offerCount === 0 &&
      batch.data.status !== "accepted";

    if (retryCondition) {
      const { data: sr } = await supabase
        .from("service-request")
        .select("service_type, area, pincode")
        .eq("id", serviceRequestId)
        .maybeSingle();

      const serviceId = await resolveBookingServiceId(supabase, ctx);

      const matching = await startWorkerMatchingWithNotifications(supabase, {
        serviceRequestId,
        serviceId,
        serviceType: sr?.service_type ? String(sr.service_type) : undefined,
        area: sr?.area ? String(sr.area) : customer.area,
        pincode: sr?.pincode ? String(sr.pincode) : customer.pincode,
      });

      if (matching.error) {
        console.error("[whatsapp] worker matching retry failed:", matching.error);
      }

      if (matching.batch.offerCount > 0) {
        await patchConversation(supabase, conversation, {
          last_message_id: messageId,
          last_message_at: new Date().toISOString(),
          context: {
            ...ctx,
            phase: "worker_matching_pending",
            matching_batch: 1,
            matching_status: matching.batch.status,
            offer_count: matching.batch.offerCount,
            service_request_id: serviceRequestId,
            ...(matching.devAcceptLinks.length > 0
              ? { dev_accept_links: matching.devAcceptLinks }
              : {}),
          },
        });
        const send = await sendWhatsAppText(
          customer.mobile,
          RATE_CARD_ACCEPTED[lang],
        );
        return { handled: true, replied: send.ok };
      }
    }
  }

  const send = await sendWhatsAppText(customer.mobile, WORKER_MATCHING_PENDING[lang]);
  await patchConversation(supabase, conversation, {
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
  });
  return { handled: true, replied: send.ok };
}

/** Phase 4A booking FSM — service selection through worker assignment. */
export async function handleBookingFlow(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  switch (input.conversation.state) {
    case "service_selection":
      return handleServiceSelection(input);
    case "address_collection":
    case "pincode_collection":
      return handleDetailsCollection(input);
    case "date_selection":
      return handleDateSelection(input);
    case "slot_selection":
      return handleSlotSelection(input);
    case "rate_card_confirmation":
      return handleRateCardConfirmation(input);
    case "worker_assignment":
      return handleWorkerAssignment(input);
    default:
      return recoverToServiceSelection(
        input,
        `unknown_booking_state:${input.conversation.state}`,
      );
  }
}

/** Send service menu immediately after language confirmation. */
export async function sendPostLanguageServiceMenu(
  supabase: SupabaseClient,
  customer: Customer,
  conversation: WhatsappConversation,
  lang: Lang,
  messageId: string,
): Promise<HandleMessageResult> {
  const menuResult = await loadServiceMenu(supabase, lang);
  if (menuResult.error) {
    console.error("[whatsapp] service catalog failed:", menuResult.error);
    const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
    return { handled: true, replied: send.ok, error: menuResult.error };
  }

  const body = languageConfirmationWithMenu(
    lang,
    LANGUAGE_CONFIRMATION[lang],
    menuResult.body,
  );
  const send = await sendWhatsAppText(customer.mobile, body);

  await patchConversation(supabase, conversation, {
    state: "service_selection",
    service_request_id: null,
    booking_id: null,
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: buildServiceMenuContext(lang, menuResult.menu, true),
  });

  return { handled: true, replied: send.ok };
}

export async function sendReturningCustomerServiceMenu(
  supabase: SupabaseClient,
  customer: Customer,
  conversation: WhatsappConversation,
  lang: Lang,
  messageId: string,
  isGreetingMessage: boolean,
): Promise<HandleMessageResult> {
  const menuResult = await loadServiceMenu(supabase, lang);
  if (menuResult.error) {
    console.error("[whatsapp] service catalog failed:", menuResult.error);
    const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
    return { handled: true, replied: send.ok, error: menuResult.error };
  }

  const body = isGreetingMessage
    ? returningCustomerGreetingWithMenu(lang, menuResult.body)
    : menuResult.body;

  const send = await sendWhatsAppText(customer.mobile, body);
  const ctx = conversation.context as ConversationContext;

  await patchConversation(supabase, conversation, {
    state: "service_selection",
    service_request_id: null,
    booking_id: null,
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: buildServiceMenuContext(lang, menuResult.menu, ctx.whatsapp_onboarding_started),
  });

  return { handled: true, replied: send.ok };
}

export async function logConversationStateAfter(
  supabase: SupabaseClient,
  conversationId: string,
  mobile: string,
  messageId: string,
): Promise<void> {
  const refreshed = await refreshConversation(supabase, conversationId);
  if (!refreshed.data) return;
  const ctx = refreshed.data.context as ConversationContext;
  waDebug("STATE-AFTER", {
    messageId,
    mobile,
    stateAfter: refreshed.data.state,
    contextSummary: waContextSnapshot(ctx),
  });
}
