import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { canExposeDevOtpInApi } from "@/lib/env/runtime";
import { isSmsMockEnabled } from "@/lib/sms/client";

export const WORKER_SESSION_COOKIE = "homigo_worker_session";
const SESSION_TTL_HOURS = 72;
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_REQUESTS_PER_HOUR = 5;

function isDevOtpAllowed(): boolean {
  return canExposeDevOtpInApi() && isSmsMockEnabled();
}

function hashValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export async function findWorkerByMobile(
  supabase: SupabaseClient,
  mobile: string,
): Promise<{ id: string; mobile: string; name: string; lang: "mr" | "hi" | "en" } | null> {
  const normalized = normalizeMobile(mobile);
  const { data } = await supabase
    .from("workers")
    .select('id, mobile_number, "Full name", preferred_language, status, is_verified, deleted_at')
    .eq("mobile_number", normalized)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data || data.status !== "active" || !data.is_verified) return null;

  const langRaw = String(data.preferred_language ?? "mr");
  const lang = langRaw === "hi" || langRaw === "en" ? langRaw : "mr";

  return {
    id: String(data.id),
    mobile: normalized,
    name: String(data["Full name"] ?? "Worker"),
    lang,
  };
}

export async function requestWorkerOtp(
  supabase: SupabaseClient,
  mobile: string,
): Promise<{ ok: boolean; error?: string; devOtp?: string }> {
  const worker = await findWorkerByMobile(supabase, mobile);
  if (!worker) {
    return { ok: false, error: "Worker not found or not active" };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentRequests } = await supabase
    .from("worker_login_otps")
    .select("id", { count: "exact", head: true })
    .eq("worker_id", worker.id)
    .gte("created_at", oneHourAgo);

  if ((recentRequests ?? 0) >= MAX_OTP_REQUESTS_PER_HOUR) {
    return { ok: false, error: "Too many OTP requests. Try again later." };
  }

  const otp = generateOtp();
  const otpHash = hashValue(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabase.from("worker_login_otps").insert({
    worker_id: worker.id,
    mobile: worker.mobile,
    otp_hash: otpHash,
    expires_at: expiresAt,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const { sendSmsText } = await import("@/lib/sms/client");
  const smsResult = await sendSmsText(
    worker.mobile,
    `Homigo worker login OTP: ${otp}. Valid ${OTP_TTL_MINUTES} minutes.`,
  );

  if (!smsResult.ok && !isSmsMockEnabled()) {
    if (isDevOtpAllowed()) {
      return { ok: true, devOtp: otp };
    }
    return { ok: false, error: smsResult.error ?? "Failed to send OTP SMS" };
  }

  return {
    ok: true,
    ...(isDevOtpAllowed() && (isSmsMockEnabled() || smsResult.mocked) ? { devOtp: otp } : {}),
  };
}

export async function verifyWorkerOtp(
  supabase: SupabaseClient,
  mobile: string,
  otp: string,
): Promise<{ ok: boolean; error?: string; sessionToken?: string; workerId?: string }> {
  const worker = await findWorkerByMobile(supabase, mobile);
  if (!worker) return { ok: false, error: "Worker not found" };

  const { data: rows } = await supabase
    .from("worker_login_otps")
    .select("id, otp_hash, expires_at, attempts, verified_at")
    .eq("worker_id", worker.id)
    .eq("mobile", worker.mobile)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const row = rows?.[0];
  if (!row) return { ok: false, error: "No OTP pending" };

  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { ok: false, error: "OTP expired" };
  }

  if (Number(row.attempts) >= MAX_OTP_ATTEMPTS) {
    return { ok: false, error: "Too many attempts" };
  }

  const submitted = hashValue(otp.trim());
  const expected = String(row.otp_hash);
  const match =
    submitted.length === expected.length &&
    timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));

  if (!match) {
    await supabase
      .from("worker_login_otps")
      .update({ attempts: Number(row.attempts) + 1 })
      .eq("id", row.id);
    return { ok: false, error: "Invalid OTP" };
  }

  await supabase
    .from("worker_login_otps")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", row.id);

  const sessionToken = randomBytes(32).toString("base64url");
  const tokenHash = hashValue(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  const { error: sessionError } = await supabase.from("worker_sessions").insert({
    worker_id: worker.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    last_seen_at: new Date().toISOString(),
  });

  if (sessionError) {
    return { ok: false, error: sessionError.message };
  }

  await supabase
    .from("workers")
    .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", worker.id);

  return { ok: true, sessionToken, workerId: worker.id };
}

export async function getWorkerIdFromSessionToken(
  supabase: SupabaseClient,
  sessionToken: string,
): Promise<string | null> {
  const tokenHash = hashValue(sessionToken);
  const now = new Date().toISOString();

  const { data } = await supabase
    .from("worker_sessions")
    .select("worker_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;
  if (String(data.expires_at) <= now) return null;

  await supabase
    .from("worker_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  return String(data.worker_id);
}

export async function revokeWorkerSession(
  supabase: SupabaseClient,
  sessionToken: string,
): Promise<void> {
  const tokenHash = hashValue(sessionToken);
  await supabase
    .from("worker_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .is("revoked_at", null);
}

export async function getWorkerSessionFromRequest(
  supabase: SupabaseClient,
  request: Request,
): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${WORKER_SESSION_COOKIE}=([^;]+)`));
  if (match?.[1]) {
    return getWorkerIdFromSessionToken(supabase, decodeURIComponent(match[1]));
  }

  try {
    const store = await cookies();
    const token = store.get(WORKER_SESSION_COOKIE)?.value;
    if (token) return getWorkerIdFromSessionToken(supabase, token);
  } catch {
    // cookies() unavailable outside request context
  }

  return null;
}

export function buildWorkerSessionCookie(sessionToken: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = SESSION_TTL_HOURS * 3600;
  return `${WORKER_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearWorkerSessionCookie(): string {
  return `${WORKER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
