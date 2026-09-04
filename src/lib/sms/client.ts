export type SmsProvider = "none" | "mock" | "twilio" | "msg91";

export interface SmsSendResult {
  ok: boolean;
  mocked?: boolean;
  messageId?: string;
  error?: string;
}

import { isSmsMockSendEnabled } from "@/lib/env/runtime";

export function getSmsProvider(): SmsProvider {
  const raw = (process.env.SMS_PROVIDER ?? "none").trim().toLowerCase();
  if (raw === "mock" || raw === "twilio" || raw === "msg91") return raw;
  if (isSmsMockSendEnabled()) return "mock";
  return "none";
}

export function isSmsMockEnabled(): boolean {
  return getSmsProvider() === "mock" || isSmsMockSendEnabled();
}

function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

async function sendViaTwilio(to: string, body: string): Promise<SmsSendResult> {
  const sid = process.env.SMS_TWILIO_ACCOUNT_SID;
  const token = process.env.SMS_TWILIO_AUTH_TOKEN;
  const from = process.env.SMS_TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return { ok: false, error: "Twilio SMS credentials not configured" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: `+${normalizeMobile(to)}`, From: from, Body: body });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) {
    return { ok: false, error: json.message ?? `Twilio HTTP ${res.status}` };
  }
  return { ok: true, messageId: json.sid };
}

async function sendViaMsg91(to: string, body: string): Promise<SmsSendResult> {
  const authKey = process.env.SMS_MSG91_AUTH_KEY;
  const sender = process.env.SMS_MSG91_SENDER_ID ?? "HOMIGO";

  if (!authKey) {
    return { ok: false, error: "MSG91 auth key not configured" };
  }

  const res = await fetch("https://api.msg91.com/api/v2/sendsms", {
    method: "POST",
    headers: { authkey: authKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender,
      route: "4",
      country: "91",
      sms: [{ message: body, to: [normalizeMobile(to)] }],
    }),
  });

  if (!res.ok) {
    return { ok: false, error: `MSG91 HTTP ${res.status}` };
  }
  return { ok: true, messageId: `msg91_${Date.now()}` };
}

/** Send SMS to worker mobile. Uses configured provider; mock in dev. */
export async function sendSmsText(to: string, body: string): Promise<SmsSendResult> {
  const provider = getSmsProvider();

  if (provider === "mock" || (provider === "none" && isSmsMockSendEnabled())) {
    console.log("[sms:mock]", { to: to.slice(-4), length: body.length });
    return { ok: true, mocked: true, messageId: `sms_mock_${Date.now()}` };
  }

  if (provider === "twilio") return sendViaTwilio(to, body);
  if (provider === "msg91") return sendViaMsg91(to, body);

  return { ok: false, error: "SMS provider not configured (set SMS_PROVIDER)" };
}
