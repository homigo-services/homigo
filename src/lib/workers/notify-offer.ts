import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSmsText } from "@/lib/sms/client";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import { formatIsoAsDdMmYyyy } from "@/lib/whatsapp/slots";
import type { CreatedOfferRecord } from "./offers";
import { workerLog } from "./worker-log";
import { workerOfferNotificationMessage, workerOfferSmsMessage } from "./worker-messages";

type NotifyChannel = "app" | "whatsapp" | "sms";

async function upsertNotificationRecord(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    workerId: string;
    channel: NotifyChannel;
    idempotencyKey: string;
    status: "pending" | "sent" | "failed";
    providerMessageId?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("notification_records")
    .select("id, status")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing?.status === "sent") return;

  if (existing?.id) {
    await supabase
      .from("notification_records")
      .update({
        status: input.status,
        provider_message_id: input.providerMessageId ?? null,
        sent_at: input.status === "sent" ? now : null,
        failed_at: input.status === "failed" ? now : null,
        error_message: input.errorMessage ?? null,
        updated_at: now,
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("notification_records").insert({
    offer_id: input.offerId,
    worker_id: input.workerId,
    channel: input.channel,
    notification_type: "worker_offer",
    status: input.status,
    idempotency_key: input.idempotencyKey,
    provider_message_id: input.providerMessageId ?? null,
    sent_at: input.status === "sent" ? now : null,
    failed_at: input.status === "failed" ? now : null,
    error_message: input.errorMessage ?? null,
    updated_at: now,
  });
}

export interface OfferNotificationContext {
  serviceType: string;
  area: string;
  serviceDate: string;
  preferredTimeSlot: string;
  workerEarning?: number;
}

async function loadOfferNotificationContext(
  supabase: SupabaseClient,
  serviceRequestId: string,
): Promise<OfferNotificationContext | null> {
  const { data: sr } = await supabase
    .from("service-request")
    .select("service_type, area, service_date, preferred_time_slot")
    .eq("id", serviceRequestId)
    .maybeSingle();

  if (!sr) return null;

  return {
    serviceType: String(sr.service_type ?? "Service"),
    area: String(sr.area ?? ""),
    serviceDate: formatIsoAsDdMmYyyy(String(sr.service_date ?? "")),
    preferredTimeSlot: String(sr.preferred_time_slot ?? "").replace(/:00$/, ""),
  };
}

/** Notify one worker about one offer across app + WhatsApp + SMS. */
export async function notifyWorkerOffer(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    workerId: string;
    serviceRequestId: string;
    context: OfferNotificationContext;
    workerMobile: string;
    lang?: "mr" | "hi" | "en";
  },
): Promise<void> {
  const lang = input.lang ?? "mr";
  const waBody = workerOfferNotificationMessage(lang, input.context);

  // App/in-app record (visible in worker PWA)
  const appKey = `offer:${input.offerId}:app`;
  await upsertNotificationRecord(supabase, {
    offerId: input.offerId,
    workerId: input.workerId,
    channel: "app",
    idempotencyKey: appKey,
    status: "sent",
    providerMessageId: "in_app",
  });

  workerLog("WORKER-NOTIFICATION", {
    offerId: input.offerId,
    workerId: input.workerId,
    channel: "app",
    status: "sent",
  });

  // WhatsApp
  const waKey = `offer:${input.offerId}:whatsapp`;
  const waResult = await sendWhatsAppText(input.workerMobile, waBody);
  await upsertNotificationRecord(supabase, {
    offerId: input.offerId,
    workerId: input.workerId,
    channel: "whatsapp",
    idempotencyKey: waKey,
    status: waResult.ok ? "sent" : "failed",
    providerMessageId: waResult.messageId,
    errorMessage: waResult.error,
  });

  workerLog("WORKER-NOTIFICATION", {
    offerId: input.offerId,
    workerId: input.workerId,
    channel: "whatsapp",
    status: waResult.ok ? "sent" : "failed",
    result: waResult.error,
  });

  // SMS
  const smsBody = workerOfferSmsMessage(input.context);
  const smsKey = `offer:${input.offerId}:sms`;
  const smsResult = await sendSmsText(input.workerMobile, smsBody);
  await upsertNotificationRecord(supabase, {
    offerId: input.offerId,
    workerId: input.workerId,
    channel: "sms",
    idempotencyKey: smsKey,
    status: smsResult.ok ? "sent" : "failed",
    providerMessageId: smsResult.messageId,
    errorMessage: smsResult.error,
  });

  workerLog("WORKER-NOTIFICATION", {
    offerId: input.offerId,
    workerId: input.workerId,
    channel: "sms",
    status: smsResult.ok ? "sent" : "failed",
    result: smsResult.error,
  });
}

export async function notifyWorkersForOffers(
  supabase: SupabaseClient,
  input: {
    serviceRequestId: string;
    offers: CreatedOfferRecord[];
  },
): Promise<void> {
  const ctx = await loadOfferNotificationContext(supabase, input.serviceRequestId);
  if (!ctx) return;

  const workerIds = input.offers.map((o) => o.worker_id);
  const { data: workers } = await supabase
    .from("workers")
    .select('id, mobile_number, preferred_language')
    .in("id", workerIds);

  const workerMap = new Map(
    (workers ?? []).map((w) => [
      String(w.id),
      {
        mobile: String(w.mobile_number ?? ""),
        lang: (String(w.preferred_language ?? "mr") as "mr" | "hi" | "en") || "mr",
      },
    ]),
  );

  for (const offer of input.offers) {
    const worker = workerMap.get(offer.worker_id);
    if (!worker?.mobile) continue;

    await notifyWorkerOffer(supabase, {
      offerId: offer.id,
      workerId: offer.worker_id,
      serviceRequestId: input.serviceRequestId,
      context: ctx,
      workerMobile: worker.mobile,
      lang: worker.lang,
    });
  }
}
