/** Meta WhatsApp Cloud API webhook body for inbound text messages (tests + dev simulator). */
export function buildWhatsAppWebhookPayload(
  messageId: string,
  from: string,
  body: string,
): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_DEV_SIM",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: "PHONE_DEV_SIM",
              },
              contacts: [{ profile: { name: "Dev Simulator" }, wa_id: from }],
              messages: [
                {
                  from,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function newSimulatorMessageId(prefix = "wamid.dev"): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 9)}`;
}
