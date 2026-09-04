import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getConversationByMobile,
  updateConversation,
  type ConversationContext,
} from "./conversation";
import { normalizeWhatsAppMobile } from "./parser";

const LOCK_TTL_MS = 30_000;
const MAX_LOCK_ATTEMPTS = 25;
const LOCK_POLL_MS = 80;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lockExpired(lockAt: string | undefined): boolean {
  if (!lockAt) return true;
  return Date.now() - new Date(lockAt).getTime() > LOCK_TTL_MS;
}

/** DB-backed per-mobile lock via conversation context (safe for serverless). */
export async function acquireConversationLock(
  supabase: SupabaseClient,
  rawMobile: string,
  lockId: string,
): Promise<{ acquired: boolean; conversationId: string | null; error: string | null }> {
  const mobile = normalizeWhatsAppMobile(rawMobile);

  for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt += 1) {
    const existing = await getConversationByMobile(supabase, mobile);
    if (existing.error) {
      return { acquired: false, conversationId: null, error: existing.error };
    }

    if (!existing.data) {
      return { acquired: true, conversationId: null, error: null };
    }

    const ctx = existing.data.context as ConversationContext;
    const currentLock = ctx.processing_lock as string | undefined;
    const lockAt = ctx.processing_lock_at as string | undefined;

    if (currentLock && currentLock !== lockId && !lockExpired(lockAt)) {
      await sleep(LOCK_POLL_MS);
      continue;
    }

    if (currentLock === lockId) {
      return { acquired: true, conversationId: existing.data.id, error: null };
    }

    const nextContext: ConversationContext = {
      ...ctx,
      processing_lock: lockId,
      processing_lock_at: new Date().toISOString(),
    };

    const updated = await updateConversation(supabase, existing.data.id, {
      context: nextContext,
    });

    if (updated.error) {
      return { acquired: false, conversationId: null, error: updated.error };
    }

    const verify = await getConversationByMobile(supabase, mobile);
    const verifiedLock = (verify.data?.context as ConversationContext)?.processing_lock;
    if (verifiedLock === lockId) {
      return { acquired: true, conversationId: existing.data.id, error: null };
    }

    await sleep(LOCK_POLL_MS);
  }

  return { acquired: false, conversationId: null, error: "Lock acquisition timeout" };
}

export async function releaseConversationLock(
  supabase: SupabaseClient,
  rawMobile: string,
  lockId: string,
): Promise<void> {
  const mobile = normalizeWhatsAppMobile(rawMobile);
  const existing = await getConversationByMobile(supabase, mobile);
  if (!existing.data) return;

  const ctx = existing.data.context as ConversationContext;
  if (ctx.processing_lock !== lockId) return;

  const next: ConversationContext = { ...ctx };
  delete next.processing_lock;
  delete next.processing_lock_at;

  await updateConversation(supabase, existing.data.id, { context: next });
}

export async function withConversationLock<T>(
  supabase: SupabaseClient,
  rawMobile: string,
  lockId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lock = await acquireConversationLock(supabase, rawMobile, lockId);
  if (!lock.acquired) {
    throw new Error(lock.error ?? "Could not acquire conversation lock");
  }

  try {
    return await fn();
  } finally {
    await releaseConversationLock(supabase, rawMobile, lockId);
  }
}
