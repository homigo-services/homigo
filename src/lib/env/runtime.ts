/**
 * Runtime environment helpers — mock/dev integrations are NEVER enabled in production,
 * regardless of WHATSAPP_MOCK_SEND / SMS_MOCK_SEND / RAZORPAY_MOCK_MODE values.
 */

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isNonProductionRuntime(): boolean {
  return !isProductionRuntime();
}

export function isWhatsappMockSendEnabled(): boolean {
  return isNonProductionRuntime() && process.env.WHATSAPP_MOCK_SEND === "true";
}

export function isSmsMockSendEnabled(): boolean {
  return isNonProductionRuntime() && process.env.SMS_MOCK_SEND === "true";
}

export function isRazorpayMockModeEnabled(): boolean {
  return isNonProductionRuntime() && process.env.RAZORPAY_MOCK_MODE === "true";
}

/** Dev OTP values must never appear in production API responses. */
export function canExposeDevOtpInApi(): boolean {
  return isNonProductionRuntime();
}

/** Detect dangerous mock flags set alongside production NODE_ENV. */
export function getProductionMockMisconfigWarnings(): string[] {
  if (!isProductionRuntime()) return [];

  const warnings: string[] = [];
  if (process.env.WHATSAPP_MOCK_SEND === "true") {
    warnings.push("WHATSAPP_MOCK_SEND=true is set in production (ignored)");
  }
  if (process.env.SMS_MOCK_SEND === "true") {
    warnings.push("SMS_MOCK_SEND=true is set in production (ignored)");
  }
  if (process.env.RAZORPAY_MOCK_MODE === "true") {
    warnings.push("RAZORPAY_MOCK_MODE=true is set in production (ignored)");
  }
  return warnings;
}
