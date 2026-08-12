import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceRateCard, ServiceRateCardWithService } from "./types";

const TABLE = "service_rate_cards";

export interface RateCardCreateInput {
  service_id: string;
  base_amount: number;
  lead_charge?: number;
  platform_commission?: number;
  worker_earning?: number;
  effective_from?: string;
  effective_to?: string | null;
  is_active?: boolean;
  notes?: string | null;
}

export type RateCardUpdateInput = Partial<RateCardCreateInput>;

function normalize(row: Record<string, unknown>): ServiceRateCard {
  return {
    id: String(row.id),
    service_id: String(row.service_id),
    base_amount: Number(row.base_amount),
    lead_charge: Number(row.lead_charge),
    platform_commission: Number(row.platform_commission),
    worker_earning: Number(row.worker_earning),
    effective_from: String(row.effective_from),
    effective_to: row.effective_to ? String(row.effective_to) : null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    notes: row.notes ? String(row.notes) : null,
  };
}

export async function listRateCards(
  supabase: SupabaseClient,
  options: { activeOnly?: boolean } = {},
): Promise<{ data: ServiceRateCardWithService[]; error: string | null }> {
  let query = supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (options.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  const cards = (data ?? []).map((row) => normalize(row as Record<string, unknown>));
  const serviceIds = [...new Set(cards.map((c) => c.service_id))];

  const { data: services } = await supabase
    .from("services")
    .select("id, name")
    .in("id", serviceIds);

  const nameMap = new Map(
    (services ?? []).map((s) => [String(s.id), String(s.name)]),
  );

  return {
    data: cards.map((card) => ({
      ...card,
      service_name: nameMap.get(card.service_id) ?? "Unknown Service",
    })),
    error: null,
  };
}

export async function getActiveRateCardForService(
  supabase: SupabaseClient,
  serviceId: string,
  at: Date = new Date(),
): Promise<{ data: ServiceRateCard | null; error: string | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .lte("effective_from", at.toISOString())
    .or(`effective_to.is.null,effective_to.gt.${at.toISOString()}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: data ? normalize(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function getRateCardById(
  supabase: SupabaseClient,
  id: string,
): Promise<{ data: ServiceRateCard | null; error: string | null; notFound: boolean }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message, notFound: false };
  }

  if (!data) {
    return { data: null, error: null, notFound: true };
  }

  return {
    data: normalize(data as Record<string, unknown>),
    error: null,
    notFound: false,
  };
}

export async function createRateCard(
  supabase: SupabaseClient,
  input: RateCardCreateInput,
): Promise<{ data: ServiceRateCard | null; error: string | null }> {
  const now = new Date().toISOString();
  const payload = {
    service_id: input.service_id,
    base_amount: input.base_amount,
    lead_charge: input.lead_charge ?? 0,
    platform_commission: input.platform_commission ?? 0,
    worker_earning: input.worker_earning ?? 0,
    effective_from: input.effective_from ?? now,
    effective_to: input.effective_to ?? null,
    is_active: input.is_active ?? true,
    notes: input.notes?.trim() || null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: normalize(data as Record<string, unknown>),
    error: null,
  };
}

export async function updateRateCard(
  supabase: SupabaseClient,
  id: string,
  input: RateCardUpdateInput,
): Promise<{ data: ServiceRateCard | null; error: string | null }> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.service_id !== undefined) payload.service_id = input.service_id;
  if (input.base_amount !== undefined) payload.base_amount = input.base_amount;
  if (input.lead_charge !== undefined) payload.lead_charge = input.lead_charge;
  if (input.platform_commission !== undefined)
    payload.platform_commission = input.platform_commission;
  if (input.worker_earning !== undefined) payload.worker_earning = input.worker_earning;
  if (input.effective_from !== undefined) payload.effective_from = input.effective_from;
  if (input.effective_to !== undefined) payload.effective_to = input.effective_to;
  if (input.is_active !== undefined) payload.is_active = input.is_active;
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: normalize(data as Record<string, unknown>),
    error: null,
  };
}
