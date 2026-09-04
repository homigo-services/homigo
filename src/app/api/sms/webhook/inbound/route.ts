import { NextResponse } from "next/server";
import { processSmsInboundAction } from "@/lib/sms/inbound";

function verifySmsWebhook(request: Request): boolean {
  const secret = process.env.SMS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const custom = request.headers.get("x-homigo-sms-secret") ?? "";
  return bearer === secret || custom === secret;
}

/** Generic SMS inbound webhook — supports Twilio-style form posts and JSON. */
export async function POST(request: Request) {
  if (!verifySmsWebhook(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let fromMobile = "";
    let body = "";
    let eventId = "";

    if (contentType.includes("application/json")) {
      const json = (await request.json()) as Record<string, string>;
      fromMobile = json.From ?? json.from ?? json.mobile ?? "";
      body = json.Body ?? json.body ?? json.text ?? "";
      eventId = json.MessageSid ?? json.id ?? `${fromMobile}:${body}:${Date.now()}`;
    } else {
      const form = await request.formData();
      fromMobile = String(form.get("From") ?? form.get("from") ?? "");
      body = String(form.get("Body") ?? form.get("body") ?? "");
      eventId = String(form.get("MessageSid") ?? form.get("id") ?? `${fromMobile}:${body}`);
    }

    if (!fromMobile || !body) {
      return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
    }

    const provider = (process.env.SMS_PROVIDER ?? "generic").trim();
    const result = await processSmsInboundAction({
      provider,
      eventId,
      fromMobile,
      body,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
