/** Structured worker-platform logs — never log secrets/OTP/tokens. */
export type WorkerLogEvent =
  | "WORKER-MATCHING"
  | "WORKER-BATCH-CREATED"
  | "WORKER-OFFER-CREATED"
  | "WORKER-NOTIFICATION"
  | "WORKER-OFFER-ACCEPT"
  | "WORKER-OFFER-REJECT"
  | "WORKER-OFFER-EXPIRE"
  | "WORKER-BATCH-ADVANCE";

export interface WorkerLogPayload {
  serviceRequestId?: string;
  offerId?: string;
  workerId?: string;
  batchNumber?: number;
  channel?: string;
  status?: string;
  result?: string;
  error?: string;
}

export function workerLog(event: WorkerLogEvent, payload: WorkerLogPayload): void {
  console.log(`[${event}]`, JSON.stringify(payload));
}
