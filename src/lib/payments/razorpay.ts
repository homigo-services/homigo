import { createHmac, timingSafeEqual } from "node:crypto";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mockMode: boolean;
}

import { isRazorpayMockModeEnabled } from "@/lib/env/runtime";

export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
  const mockMode = isRazorpayMockModeEnabled();

  if (mockMode) {
    return {
      keyId: keyId ?? "mock_key",
      keySecret: keySecret ?? "mock_secret",
      webhookSecret: webhookSecret || "mock_webhook",
      mockMode: true,
    };
  }

  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret, mockMode: false };
}

export function verifyRazorpayWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  try {
    return (
      expected.length === signature.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    );
  } catch {
    return false;
  }
}

export function verifyRazorpayPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}): boolean {
  const body = `${input.orderId}|${input.paymentId}`;
  const expected = createHmac("sha256", input.secret).update(body).digest("hex");
  try {
    return (
      expected.length === input.signature.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature))
    );
  } catch {
    return false;
  }
}

export async function createRazorpayOrder(input: {
  amountInr: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  const config = getRazorpayConfig();
  if (!config) {
    return { ok: false, error: "Razorpay not configured" };
  }

  if (config.mockMode) {
    return { ok: true, orderId: `order_mock_${Date.now()}` };
  }

  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(input.amountInr * 100),
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes,
    }),
  });

  const json = (await res.json()) as { id?: string; error?: { description?: string } };
  if (!res.ok) {
    return { ok: false, error: json.error?.description ?? `Razorpay HTTP ${res.status}` };
  }

  return { ok: true, orderId: json.id };
}

export async function createRazorpayPaymentLink(input: {
  amountInr: number;
  description: string;
  customerMobile: string;
  referenceId: string;
}): Promise<{ ok: boolean; url?: string; linkId?: string; error?: string }> {
  const config = getRazorpayConfig();
  if (!config) {
    return { ok: false, error: "Razorpay not configured" };
  }

  if (config.mockMode) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return {
      ok: true,
      url: `${base}/api/payments/razorpay/mock-pay?ref=${encodeURIComponent(input.referenceId)}`,
      linkId: `plink_mock_${Date.now()}`,
    };
  }

  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(input.amountInr * 100),
      currency: "INR",
      description: input.description,
      customer: { contact: input.customerMobile.replace(/\D/g, "") },
      reference_id: input.referenceId,
      notify: { sms: false, email: false },
      reminder_enable: false,
    }),
  });

  const json = (await res.json()) as {
    id?: string;
    short_url?: string;
    error?: { description?: string };
  };

  if (!res.ok) {
    return { ok: false, error: json.error?.description ?? `Razorpay HTTP ${res.status}` };
  }

  return { ok: true, url: json.short_url, linkId: json.id };
}
