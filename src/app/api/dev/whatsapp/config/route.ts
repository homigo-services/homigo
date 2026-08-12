import { devOnlyJsonResponse } from "@/lib/dev/guard";
import { isWhatsappMockSendEnabled } from "@/lib/whatsapp/config";

export async function GET() {
  const blocked = devOnlyJsonResponse();
  if (blocked) return blocked;

  return Response.json({
    devOnly: true,
    mockSend: isWhatsappMockSendEnabled(),
    webhookPath: "/api/whatsapp/webhook",
  });
}
