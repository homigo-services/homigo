export interface WorkerOfferMessageContext {
  serviceType: string;
  area: string;
  serviceDate: string;
  preferredTimeSlot: string;
}

export function workerOfferNotificationMessage(
  lang: "mr" | "hi" | "en",
  ctx: WorkerOfferMessageContext,
): string {
  const slot = ctx.preferredTimeSlot.replace(/-/g, "–");
  const templates = {
    mr: `Homigo कडून नवीन service request उपलब्ध आहे.

Service: ${ctx.serviceType}
Area: ${ctx.area}
Date: ${ctx.serviceDate}
Preferred Time: ${slot}

1. Accept
2. Reject`,
    hi: `Homigo से नई service request उपलब्ध है।

Service: ${ctx.serviceType}
Area: ${ctx.area}
Date: ${ctx.serviceDate}
Preferred Time: ${slot}

1. Accept
2. Reject`,
    en: `New service request from Homigo.

Service: ${ctx.serviceType}
Area: ${ctx.area}
Date: ${ctx.serviceDate}
Preferred Time: ${slot}

1. Accept
2. Reject`,
  };
  return templates[lang];
}

export function workerOfferSmsMessage(ctx: WorkerOfferMessageContext): string {
  const slot = ctx.preferredTimeSlot.replace(/-/g, "-");
  return `Homigo: ${ctx.serviceType} at ${ctx.area}, ${ctx.serviceDate} ${slot}. Reply 1=Accept 2=Reject`;
}

export function workerOfferAcceptedMessage(lang: "mr" | "hi" | "en"): string {
  return {
    mr: "Request accepted successfully. Customer ला confirmation पाठवली जाईल.",
    hi: "Request accept ho gayi. Customer ko confirmation bheja jayega.",
    en: "Request accepted successfully. The customer will be notified.",
  }[lang];
}

export function workerOfferRejectedMessage(lang: "mr" | "hi" | "en"): string {
  return {
    mr: "Request rejected successfully.",
    hi: "Request reject ho gayi.",
    en: "Request rejected successfully.",
  }[lang];
}

export function workerOfferUnavailableMessage(lang: "mr" | "hi" | "en"): string {
  return {
    mr: "ही request आता उपलब्ध नाही.",
    hi: "Yeh request ab uplabdh nahi hai.",
    en: "This request is no longer available.",
  }[lang];
}

export function workerOfferInvalidReplyMessage(lang: "mr" | "hi" | "en"): string {
  return {
    mr: "कृपया 1 (Accept) किंवा 2 (Reject) पाठवा.",
    hi: "Kripya 1 (Accept) ya 2 (Reject) bhejein.",
    en: "Please reply with 1 to Accept or 2 to Reject.",
  }[lang];
}

export function workerOfferExpiredMessage(lang: "mr" | "hi" | "en"): string {
  return {
    mr: "ही offer कालबाह्य झाली आहे.",
    hi: "Yeh offer samapt ho chuki hai.",
    en: "This offer has expired.",
  }[lang];
}

export const WORKER_NOT_FOUND_CUSTOMER: Record<"mr" | "hi" | "en", string> = {
  mr: "No suitable Homigo professional is currently available for your selected slot. We will help you with the next available option.",
  hi: "No suitable Homigo professional is currently available for your selected slot. We will help you with the next available option.",
  en: "No suitable Homigo professional is currently available for your selected slot. We will help you with the next available option.",
};
