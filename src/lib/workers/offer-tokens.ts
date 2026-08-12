import { createHash, randomBytes } from "node:crypto";

/** Generate a one-time worker accept token (raw — never persist). */
export function generateOfferAcceptToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hash stored in worker_service_offers.accept_token_hash. */
export function hashOfferAcceptToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function buildWorkerOfferAcceptPath(rawToken: string): string {
  return `/api/workers/offers/${encodeURIComponent(rawToken)}`;
}
