import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let warnedAboutAnonFallback = false;

export function createSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (serviceKey) {
    return createClient(url, serviceKey);
  }

  if (anonKey) {
    if (!warnedAboutAnonFallback && process.env.NODE_ENV === "production") {
      warnedAboutAnonFallback = true;
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not set. Using anon key for server API routes.",
      );
    }
    return createClient(url, anonKey);
  }

  throw new Error(
    "Missing Supabase credentials. Set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

/** Service-role client for server routes that must bypass RLS (WhatsApp webhook, admin APIs). */
export function createSupabaseServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY — required for WhatsApp webhook processing",
    );
  }

  return createClient(url, serviceKey);
}

export function getWorkersEnvStatus() {
  return {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    workersImportSecret: Boolean(process.env.WORKERS_IMPORT_SECRET),
    workerRegistrationFormUrl: Boolean(
      process.env.NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL,
    ),
  };
}
