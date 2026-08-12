import {
  assertWhatsappConfig,
  isWhatsappMockSendEnabled,
  WHATSAPP_GRAPH_API_VERSION,
} from "./config";

export interface SendWhatsAppTextResult {
  ok: boolean;
  mocked?: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Send a WhatsApp text message via Meta Graph API (server-only).
 * Set WHATSAPP_MOCK_SEND=true to skip outbound HTTP (local tests).
 */
export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<SendWhatsAppTextResult> {
  if (isWhatsappMockSendEnabled()) {
    return { ok: true, mocked: true, messageId: `mock_${Date.now()}` };
  }

  let accessToken: string;
  let phoneNumberId: string;

  try {
    ({ accessToken, phoneNumberId } = assertWhatsappConfig());
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "WhatsApp not configured",
    };
  }

  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "text",
        text: { body },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      const safeMessage =
        payload.error?.message ?? `Meta API returned HTTP ${response.status}`;
      console.error("[whatsapp] send failed:", {
        status: response.status,
        code: payload.error?.code,
        message: safeMessage,
      });
      return {
        ok: false,
        error: safeMessage,
        statusCode: response.status,
      };
    }

    return {
      ok: true,
      messageId: payload.messages?.[0]?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    console.error("[whatsapp] send error:", message);
    return { ok: false, error: message };
  }
}
