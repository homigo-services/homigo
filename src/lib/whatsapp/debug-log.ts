/** Safe structured WhatsApp debug logging — never log secrets. */

export type WaDebugStage = "IN" | "ROUTE" | "STATE" | "BRANCH" | "OUT";

export interface WaDebugPayload {
  messageId?: string;
  mobile?: string;
  actor?: "customer" | "worker";
  state?: string;
  phase?: string;
  handler?: string;
  branch?: string;
  textPreview?: string;
  duplicate?: boolean;
  replied?: boolean;
  error?: string;
}

function redactMobile(mobile: string | undefined): string | undefined {
  if (!mobile) return undefined;
  const digits = mobile.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
}

export function waDebug(stage: WaDebugStage, payload: WaDebugPayload): void {
  const safe = {
    ...payload,
    mobile: redactMobile(payload.mobile),
    textPreview: payload.textPreview?.slice(0, 32),
  };
  console.log(`[WA-${stage}]`, JSON.stringify(safe));
}
