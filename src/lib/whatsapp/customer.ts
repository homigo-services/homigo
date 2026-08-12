import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerByMobile } from "@/lib/customers/queries";
import type { Customer } from "@/lib/customers/types";
import { normalizeWhatsAppMobile } from "./parser";

const TABLE = "customers";

/** Required NOT NULL columns use pending sentinels until collected in a later phase. */
const PENDING = "pending";

/**
 * Find or create customer by WhatsApp mobile.
 * Existing customers: only verify WhatsApp flag + updated_at (no overwrite of profile).
 */
export async function upsertCustomerFromWhatsApp(
  supabase: SupabaseClient,
  rawMobile: string,
): Promise<{ customer: Customer | null; created: boolean; error: string | null }> {
  const mobile = normalizeWhatsAppMobile(rawMobile);
  const existing = await getCustomerByMobile(supabase, mobile);

  if (existing.error) {
    return { customer: null, created: false, error: existing.error };
  }

  const now = new Date().toISOString();

  if (existing.data) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        is_whatsapp_verified: true,
        updated_at: now,
      })
      .eq("id", existing.data.id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      return { customer: null, created: false, error: error.message };
    }

    return {
      customer: data as unknown as Customer,
      created: false,
      error: null,
    };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      name: mobile,
      mobile,
      area: PENDING,
      pincode: PENDING,
      address_line: PENDING,
      preferred_language: "mr",
      is_whatsapp_verified: true,
      source: "whatsapp",
      status: "active",
      subscription_status: "free",
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    return { customer: null, created: false, error: error.message };
  }

  return {
    customer: data as unknown as Customer,
    created: true,
    error: null,
  };
}
