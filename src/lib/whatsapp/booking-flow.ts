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
  COLLECT_ADDRESS,
  COLLECT_AREA,
  COLLECT_PINCODE,
  dateSelectionPrompt,
  GENERIC_ERROR,
  INVALID_DATE,
  INVALID_PINCODE,
  INVALID_RATE_CARD_REPLY,
  INVALID_SERVICE_SELECTION,
  INVALID_SLOT,
  languageConfirmationWithMenu,
  PRICING_UNAVAILABLE,
  rateCardQuoteMessage,
  RATE_CARD_ACCEPTED,
  RATE_CARD_REJECTED,
  returningCustomerGreetingWithMenu,
  slotSelectionPrompt,
  WORKER_MATCHING_PENDING,
} from "./booking-messages";
import {
  type ConversationContext,
  readyLanguageContext,
  updateConversation,
} from "./conversation";
import { isGreeting } from "./parser";
import {
  loadServiceMenu,
  resolveServiceFromMenu,
  type ServiceMenuEntry,
} from "./service-menu";
import {
  isPastDate,
  parseCustomerDateInput,
  parseSlotSelection,
  todayIso,
  tomorrowIso,
} from "./slots";
import type { WhatsappConversation, WhatsappConversationState } from "./types";
import type { HandleMessageResult } from "./handler";
import { getBatchStatus } from "@/lib/workers/matching";
import { startWorkerMatchingBatch1 } from "@/lib/workers/offers";
import { WORKER_MATCHING_STARTED } from "./booking-messages";
import { LANGUAGE_CONFIRMATION } from "./messages";

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

function getMissingFields(customer: Customer): CollectingField[] {
  const missing: CollectingField[] = [];
  if (!customer.area?.trim() || customer.area === "pending") missing.push("area");
  if (!customer.pincode?.trim() || customer.pincode === "pending")
    missing.push("pincode");
  if (!customer.address_line?.trim() || customer.address_line === "pending")
    missing.push("address_line");
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

async function sendMenuAndPersist(
  input: BookingFlowInput,
  prefix = "",
): Promise<HandleMessageResult> {
  const { supabase, conversation, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);

  const menuResult = await loadServiceMenu(supabase, lang);
  if (menuResult.error) {
    console.error("[whatsapp] service catalog failed:", menuResult.error);
    const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
    return { handled: true, replied: send.ok, error: menuResult.error };
  }

  const body = prefix ? `${prefix}${menuResult.body}` : menuResult.body;
  const send = await sendWhatsAppText(customer.mobile, body);

  await patchConversation(supabase, conversation, {
    state: "service_selection",
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: {
      ...ctx,
      phase: "ready",
      service_menu: menuResult.menu,
    },
  });

  return { handled: true, replied: send.ok };
}

async function beginDetailsCollection(
  input: BookingFlowInput,
  customer: Customer,
  ctx: ConversationContext,
): Promise<HandleMessageResult> {
  const missing = getMissingFields(customer);
  if (missing.length === 0) {
    const send = await sendWhatsAppText(
      input.customer.mobile,
      dateSelectionPrompt(input.lang),
    );
    await patchConversation(input.supabase, input.conversation, {
      state: "date_selection",
      last_message_id: input.messageId,
      last_message_at: new Date().toISOString(),
      context: { ...ctx, collecting_field: undefined },
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
    context: { ...ctx, collecting_field: field },
  });
  return { handled: true, replied: send.ok };
}

async function handleServiceSelection(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, text, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);
  let menu = menuFromContext(ctx);

  if (menu.length === 0 || isGreeting(text)) {
    if (isGreeting(text)) {
      const menuResult = await loadServiceMenu(supabase, lang);
      if (menuResult.error) {
        console.error("[whatsapp] service catalog failed:", menuResult.error);
        const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
        return { handled: true, replied: send.ok, error: menuResult.error };
      }
      const body = returningCustomerGreetingWithMenu(lang, menuResult.body);
      const send = await sendWhatsAppText(customer.mobile, body);
      await patchConversation(supabase, conversation, {
        state: "service_selection",
        last_message_id: messageId,
        last_message_at: new Date().toISOString(),
        context: { ...ctx, phase: "ready", service_menu: menuResult.menu },
      });
      return { handled: true, replied: send.ok };
    }
    return sendMenuAndPersist(input);
  }

  const selected = resolveServiceFromMenu(text, menu);
  if (!selected) {
    const menuResult = await loadServiceMenu(supabase, lang);
    if (menuResult.error) {
      console.error("[whatsapp] service catalog failed:", menuResult.error);
      const send = await sendWhatsAppText(customer.mobile, GENERIC_ERROR[lang]);
      return { handled: true, replied: send.ok, error: menuResult.error };
    }
    const body = `${INVALID_SERVICE_SELECTION[lang]}\n\n${menuResult.body}`;
    const send = await sendWhatsAppText(customer.mobile, body);
    await patchConversation(supabase, conversation, {
      state: "service_selection",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: { ...ctx, phase: "ready", service_menu: menuResult.menu },
    });
    return { handled: true, replied: send.ok };
  }

  const updatedCtx: ConversationContext = {
    ...ctx,
    service_id: selected.id,
    service_name: selected.name,
    original_message: text,
    phase: "booking",
  };

  const patched = await patchConversation(supabase, conversation, {
    context: updatedCtx,
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
  });

  const freshCustomer = (await refreshCustomer(supabase, customer.id)) ?? customer;
  return beginDetailsCollection(
    { ...input, conversation: patched ?? conversation },
    freshCustomer,
    updatedCtx,
  );
}

async function handleDetailsCollection(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, text, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);
  const field = ctx.collecting_field as CollectingField | undefined;

  if (!field) {
    const fresh = (await refreshCustomer(supabase, customer.id)) ?? customer;
    return beginDetailsCollection(input, fresh, ctx);
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

  const freshCustomer = (await refreshCustomer(supabase, customer.id)) ?? customer;
  return beginDetailsCollection(input, freshCustomer, ctx);
}

async function handleDateSelection(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, text, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);
  const trimmed = text.trim();

  let isoDate: string | null = null;

  if (trimmed === "1") isoDate = todayIso();
  else if (trimmed === "2") isoDate = tomorrowIso();
  else isoDate = parseCustomerDateInput(trimmed);

  if (!isoDate || isPastDate(isoDate)) {
    const send = await sendWhatsAppText(
      customer.mobile,
      `${INVALID_DATE[lang]}\n\n${dateSelectionPrompt(lang)}`,
    );
    return { handled: true, replied: send.ok };
  }

  const send = await sendWhatsAppText(customer.mobile, slotSelectionPrompt(lang));
  await patchConversation(supabase, conversation, {
    state: "slot_selection",
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: { ...ctx, service_date: isoDate },
  });
  return { handled: true, replied: send.ok };
}

async function handleSlotSelection(
  input: BookingFlowInput,
): Promise<HandleMessageResult> {
  const { supabase, conversation, text, messageId, lang, customer } = input;
  const ctx = ctxOf(conversation);

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

  if (!serviceId || !serviceDate) {
    console.error("[whatsapp] missing service context for slot selection");
    return sendMenuAndPersist(input);
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
    const send = await sendWhatsAppText(customer.mobile, PRICING_UNAVAILABLE[lang]);
    await patchConversation(supabase, conversation, {
      state: "service_selection",
      service_request_id: srResult.data.id,
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: {
        ...ctx,
        phase: "rate_unavailable",
        preferred_time_slot: slot.value,
        service_request_id: srResult.data.id,
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
      ...ctx,
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

      const matching = await startWorkerMatchingBatch1(supabase, {
        serviceRequestId,
        serviceId,
        serviceType: sr?.service_type ? String(sr.service_type) : undefined,
        area: sr?.area ? String(sr.area) : customer.area,
        pincode: sr?.pincode ? String(sr.pincode) : customer.pincode,
      });

      if (matching.error) {
        console.error("[whatsapp] worker matching failed:", matching.error);
      }

      matchingMessage = WORKER_MATCHING_STARTED[lang](matching.batch.offerCount);

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
      context: {
        phase: "ready",
        whatsapp_onboarding_started: ctx.whatsapp_onboarding_started,
        language_confirmed_at: ctx.language_confirmed_at,
      },
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

  console.log("[whatsapp][worker_assignment] enter", {
    conversationId: conversation.id,
    mobile: customer.mobile,
    text: input.text,
    serviceRequestId: serviceRequestId || null,
    contextServiceRequestId: ctx.service_request_id ?? null,
    columnServiceRequestId: conversation.service_request_id ?? null,
  });

  if (serviceRequestId) {
    const batch = await getBatchStatus(supabase, serviceRequestId, 1);
    const retryCondition =
      !batch.error &&
      batch.data.offerCount === 0 &&
      batch.data.status !== "accepted";

    console.log("[whatsapp][worker_assignment] batch status", {
      serviceRequestId,
      offerCount: batch.data.offerCount,
      batchStatus: batch.data.status,
      batchError: batch.error,
      retryCondition,
    });

    if (retryCondition) {
      const { data: sr } = await supabase
        .from("service-request")
        .select("service_type, area, pincode")
        .eq("id", serviceRequestId)
        .maybeSingle();

      const serviceId = await resolveBookingServiceId(supabase, ctx);

      console.log("[whatsapp][worker_assignment] calling startWorkerMatchingBatch1", {
        serviceRequestId,
        serviceId: serviceId ?? null,
        serviceType: sr?.service_type ?? null,
        area: sr?.area ?? customer.area,
        pincode: sr?.pincode ?? customer.pincode,
      });

      const matching = await startWorkerMatchingBatch1(supabase, {
        serviceRequestId,
        serviceId,
        serviceType: sr?.service_type ? String(sr.service_type) : undefined,
        area: sr?.area ? String(sr.area) : customer.area,
        pincode: sr?.pincode ? String(sr.pincode) : customer.pincode,
      });

      console.log("[whatsapp][worker_assignment] startWorkerMatchingBatch1 result", {
        serviceRequestId,
        offerCount: matching.batch.offerCount,
        batchStatus: matching.batch.status,
        error: matching.error,
        serviceId: matching.serviceId,
        offersCreated: matching.offers.length,
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
          WORKER_MATCHING_STARTED[lang](matching.batch.offerCount),
        );
        return { handled: true, replied: send.ok };
      }
    }
  } else {
    console.log("[whatsapp][worker_assignment] skip retry — no serviceRequestId");
  }

  const send = await sendWhatsAppText(customer.mobile, WORKER_MATCHING_PENDING[lang]);
  await patchConversation(supabase, conversation, {
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
  });
  return { handled: true, replied: send.ok };
}

/** Phase 4A booking FSM — service selection through rate card confirmation. */
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
      return handleServiceSelection(input);
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
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: {
      ...readyLanguageContext(conversation.context as ConversationContext, lang),
      service_menu: menuResult.menu,
    },
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

  await patchConversation(supabase, conversation, {
    state: "service_selection",
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: {
      ...readyLanguageContext(conversation.context as ConversationContext, lang),
      service_menu: menuResult.menu,
    },
  });

  return { handled: true, replied: send.ok };
}
