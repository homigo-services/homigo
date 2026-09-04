/** Safe structured WhatsApp debug logging — never log secrets. */

export type WaDebugStage =
  | "IN"
  | "ROUTE"
  | "STATE"
  | "STATE-AFTER"
  | "BRANCH"
  | "OUT"
  | "DATE";

export interface WaDebugPayload {
  messageId?: string;
  mobile?: string;
  actor?: "customer" | "worker";
  state?: string;
  stateBefore?: string;
  stateAfter?: string;
  phase?: string;
  handler?: string;
  branch?: string;
  textPreview?: string;
  duplicate?: boolean;
  replied?: boolean;
  error?: string;
  collecting_field?: string;
  service_id?: string;
  service_date?: string;
  service_request_id?: string;
  contextSummary?: string;
  parsed_date?: string;
  is_past?: boolean;
}

function redactMobile(mobile: string | undefined): string | undefined {
  if (!mobile) return undefined;
  const digits = mobile.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
}

function summarizeContext(ctx: Record<string, unknown> | undefined): string | undefined {
  if (!ctx) return undefined;
  const keys = [
    "phase",
    "collecting_field",
    "service_id",
    "service_date",
    "service_request_id",
    "whatsapp_onboarding_started",
  ];
  const parts: string[] = [];
  for (const k of keys) {
    if (ctx[k] !== undefined && ctx[k] !== null && ctx[k] !== "") {
      parts.push(`${k}=${String(ctx[k]).slice(0, 24)}`);
    }
  }
  return parts.length > 0 ? parts.join(",") : "{}";
}

export function waDebug(stage: WaDebugStage, payload: WaDebugPayload): void {
  const safe = {
    ...payload,
    mobile: redactMobile(payload.mobile),
    textPreview: payload.textPreview?.slice(0, 32),
    contextSummary: payload.contextSummary,
  };
  console.log(`[WA-${stage}]`, JSON.stringify(safe));
}

export function waContextSnapshot(ctx: Record<string, unknown> | undefined): string {
  return summarizeContext(ctx) ?? "{}";
}
