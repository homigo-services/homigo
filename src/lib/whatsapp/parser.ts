/** Parsed inbound WhatsApp message from Meta webhook payload. */
export interface ParsedWhatsAppMessage {
  messageId: string;
  from: string;
  timestamp: string;
  type: string;
  textBody: string | null;
}

export interface ParsedWhatsAppWebhook {
  messages: ParsedWhatsAppMessage[];
  /** Status/delivery events — ignored in Phase 3A. */
  statuses: unknown[];
}

export function normalizeWhatsAppMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export function isGreeting(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (
    /^(hi|hello|hey|namaste|hii|नमस्कार|नमस्ते)[!.?]*$/i.test(trimmed)
  ) {
    return true;
  }
  if (/^(hi|hello|hey)\s+\S/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function parseWhatsAppWebhook(body: unknown): ParsedWhatsAppWebhook {
  const messages: ParsedWhatsAppMessage[] = [];
  const statuses: unknown[] = [];

  if (!body || typeof body !== "object") {
    return { messages, statuses };
  }

  const root = body as Record<string, unknown>;
  if (root.object !== "whatsapp_business_account") {
    return { messages, statuses };
  }

  const entries = Array.isArray(root.entry) ? root.entry : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray((entry as Record<string, unknown>).changes)
      ? ((entry as Record<string, unknown>).changes as unknown[])
      : [];

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as Record<string, unknown>).value;
      if (!value || typeof value !== "object") continue;

      const val = value as Record<string, unknown>;

      if (Array.isArray(val.messages)) {
        for (const msg of val.messages) {
          if (!msg || typeof msg !== "object") continue;
          const m = msg as Record<string, unknown>;
          const type = String(m.type ?? "unknown");
          const textObj = m.text as Record<string, unknown> | undefined;

          messages.push({
            messageId: String(m.id ?? ""),
            from: String(m.from ?? ""),
            timestamp: String(m.timestamp ?? ""),
            type,
            textBody:
              type === "text" && textObj?.body
                ? String(textObj.body)
                : null,
          });
        }
      }

      if (Array.isArray(val.statuses)) {
        statuses.push(...val.statuses);
      }
    }
  }

  return { messages, statuses };
}
