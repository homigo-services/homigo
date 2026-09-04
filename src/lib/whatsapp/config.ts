import { isWhatsappMockSendEnabled as isWhatsappMockSendEnabledRuntime } from "@/lib/env/runtime";

/** Meta Graph API version for WhatsApp Cloud API. */
export const WHATSAPP_GRAPH_API_VERSION =
  process.env.WHATSAPP_GRAPH_API_VERSION ?? "v21.0";

function resolveWabaId(): string | undefined {
  return (
    process.env.WHATSAPP_WABA_ID?.trim() ||
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim()
  );
}

export interface WhatsappConfigStatus {
  accessToken: boolean;
  phoneNumberId: boolean;
  wabaId: boolean;
  webhookVerifyToken: boolean;
  complete: boolean;
}

export function getWhatsappConfigStatus(): WhatsappConfigStatus {
  const accessToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim());
  const phoneNumberId = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
  const wabaId = Boolean(resolveWabaId());
  const webhookVerifyToken = Boolean(
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim(),
  );

  return {
    accessToken,
    phoneNumberId,
    wabaId,
    webhookVerifyToken,
    complete:
      accessToken && phoneNumberId && wabaId && webhookVerifyToken,
  };
}

/** Throws if required WhatsApp env vars are missing (no secret values in message). */
export function assertWhatsappConfig(): {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  webhookVerifyToken: string;
} {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const wabaId = resolveWabaId();
  const webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();

  const missing: string[] = [];
  if (!accessToken) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!wabaId) missing.push("WHATSAPP_WABA_ID or WHATSAPP_BUSINESS_ACCOUNT_ID");
  if (!webhookVerifyToken) missing.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required WhatsApp environment variables: ${missing.join(", ")}`,
    );
  }

  return {
    accessToken: accessToken!,
    phoneNumberId: phoneNumberId!,
    wabaId: wabaId!,
    webhookVerifyToken: webhookVerifyToken!,
  };
}

export function isWhatsappMockSendEnabled(): boolean {
  return isWhatsappMockSendEnabledRuntime();
}
