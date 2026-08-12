import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
  handleIncomingTextMessage,
  handleUnsupportedMessageType,
} from "@/lib/whatsapp/handler";
import {
  markWebhookEventFailed,
  tryClaimWebhookEvent,
} from "@/lib/whatsapp/conversation";
import { normalizeWhatsAppMobile, parseWhatsAppWebhook } from "@/lib/whatsapp/parser";

function payloadHash(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 32);
}

/** Meta webhook verification (GET). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !challenge) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!webhookVerifyToken || token !== webhookVerifyToken) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

/** Meta webhook events (POST). */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: true });
  }

  const parsed = parseWhatsAppWebhook(body);

  if (parsed.messages.length === 0) {
    return NextResponse.json({ success: true });
  }

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (err) {
    console.error(
      "[whatsapp] supabase init failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ success: true });
  }

  const hash = payloadHash(body);

  for (const message of parsed.messages) {
    if (!message.messageId) continue;

    const claim = await tryClaimWebhookEvent(supabase, {
      messageId: message.messageId,
      eventType: message.type,
      whatsappMobile: normalizeWhatsAppMobile(message.from),
      payloadHash: hash,
    });

    if (claim.duplicate) {
      continue;
    }

    if (claim.error) {
      console.error("[whatsapp] idempotency insert failed:", claim.error);
      continue;
    }

    if (!claim.claimed) {
      continue;
    }

    try {
      if (message.type !== "text" || !message.textBody) {
        await handleUnsupportedMessageType(message.from);
        continue;
      }

      const result = await handleIncomingTextMessage(supabase, message);

      if (result.error) {
        await markWebhookEventFailed(
          supabase,
          message.messageId,
          result.error,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Handler error";
      console.error("[whatsapp] message handler error:", msg);
      await markWebhookEventFailed(supabase, message.messageId, msg);
    }
  }

  return NextResponse.json({ success: true });
}
