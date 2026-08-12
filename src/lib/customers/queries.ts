import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, CustomerPreferredLanguage } from "./types";

const TABLE = "customers";

export interface CustomerCreateInput {
  name: string;
  mobile: string;
  area: string;
  pincode: string;
  address_line: string;
  landmark?: string | null;
  alternate_mobile?: string | null;
  preferred_language?: CustomerPreferredLanguage;
  is_whatsapp_verified?: boolean;
  status?: string;
  source?: string;
  notes?: string | null;
}

export type CustomerUpdateInput = Partial<
  Omit<CustomerCreateInput, "mobile"> & { mobile?: string }
>;

export interface CustomerListOptions {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export interface CustomerWithStats extends Customer {
  booking_count: number;
  last_service: string | null;
}

function normalizeCustomer(row: Record<string, unknown>): Customer {
  return row as unknown as Customer;
}

export async function listCustomers(
  supabase: SupabaseClient,
  options: CustomerListOptions = {},
): Promise<{ data: Customer[]; error: string | null }> {
  let query = supabase.from(TABLE).select("*").order("created_at", {
    ascending: false,
  });

  if (!options.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status.toLowerCase());
  }

  if (options.search?.trim()) {
    const term = options.search.trim();
    query = query.or(`name.ilike.%${term}%,mobile.ilike.%${term}%`);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((row) => normalizeCustomer(row as Record<string, unknown>)),
    error: null,
  };
}

export async function getCustomerById(
  supabase: SupabaseClient,
  id: string,
): Promise<{ data: Customer | null; error: string | null; notFound: boolean }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message, notFound: false };
  }

  if (!data) {
    return { data: null, error: null, notFound: true };
  }

  return {
    data: normalizeCustomer(data as Record<string, unknown>),
    error: null,
    notFound: false,
  };
}

export async function getCustomerByMobile(
  supabase: SupabaseClient,
  mobile: string,
): Promise<{ data: Customer | null; error: string | null }> {
  const normalized = mobile.trim();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("mobile", normalized)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: data ? normalizeCustomer(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function createCustomer(
  supabase: SupabaseClient,
  input: CustomerCreateInput,
): Promise<{ data: Customer | null; error: string | null }> {
  const now = new Date().toISOString();
  const payload = {
    name: input.name.trim(),
    mobile: input.mobile.trim(),
    area: input.area.trim(),
    pincode: input.pincode.trim(),
    address_line: input.address_line.trim(),
    landmark: input.landmark?.trim() || null,
    alternate_mobile: input.alternate_mobile?.trim() || null,
    preferred_language: input.preferred_language ?? "mr",
    is_whatsapp_verified: input.is_whatsapp_verified ?? false,
    status: input.status ?? "active",
    source: input.source ?? "whatsapp",
    updated_at: now,
    notes: input.notes?.trim() || null,
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
    data: normalizeCustomer(data as Record<string, unknown>),
    error: null,
  };
}

export async function updateCustomer(
  supabase: SupabaseClient,
  id: string,
  input: CustomerUpdateInput,
): Promise<{ data: Customer | null; error: string | null }> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.mobile !== undefined) payload.mobile = input.mobile.trim();
  if (input.area !== undefined) payload.area = input.area.trim();
  if (input.pincode !== undefined) payload.pincode = input.pincode.trim();
  if (input.address_line !== undefined)
    payload.address_line = input.address_line.trim();
  if (input.landmark !== undefined)
    payload.landmark = input.landmark?.trim() || null;
  if (input.alternate_mobile !== undefined)
    payload.alternate_mobile = input.alternate_mobile?.trim() || null;
  if (input.preferred_language !== undefined)
    payload.preferred_language = input.preferred_language;
  if (input.is_whatsapp_verified !== undefined)
    payload.is_whatsapp_verified = input.is_whatsapp_verified;
  if (input.status !== undefined) payload.status = input.status;
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: normalizeCustomer(data as Record<string, unknown>),
    error: null,
  };
}

export async function upsertCustomerByMobile(
  supabase: SupabaseClient,
  input: CustomerCreateInput,
): Promise<{ data: Customer | null; error: string | null; created: boolean }> {
  const existing = await getCustomerByMobile(supabase, input.mobile);

  if (existing.error) {
    return { data: null, error: existing.error, created: false };
  }

  if (existing.data) {
    const updated = await updateCustomer(supabase, existing.data.id, {
      ...input,
      is_whatsapp_verified: input.is_whatsapp_verified ?? true,
    });
    return { ...updated, created: false };
  }

  const created = await createCustomer(supabase, {
    ...input,
    is_whatsapp_verified: input.is_whatsapp_verified ?? true,
  });
  return { ...created, created: true };
}

export async function searchCustomers(
  supabase: SupabaseClient,
  query: string,
): Promise<{ data: Customer[]; error: string | null }> {
  return listCustomers(supabase, { search: query });
}

export async function getCustomerBookingCount(
  supabase: SupabaseClient,
  customerId: string,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from("booking")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count ?? 0, error: null };
}

export async function getCustomerLastService(
  supabase: SupabaseClient,
  customerId: string,
): Promise<{ service: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("booking")
    .select("sevice_request_id, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { service: null, error: error.message };
  }

  if (!data?.sevice_request_id) {
    const sr = await supabase
      .from("service-request")
      .select("service_type")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sr.error) {
      return { service: null, error: sr.error.message };
    }

    return { service: (sr.data?.service_type as string) ?? null, error: null };
  }

  const sr = await supabase
    .from("service-request")
    .select("service_type")
    .eq("id", data.sevice_request_id)
    .maybeSingle();

  if (sr.error) {
    return { service: null, error: sr.error.message };
  }

  return { service: (sr.data?.service_type as string) ?? null, error: null };
}

export async function enrichCustomersWithStats(
  supabase: SupabaseClient,
  customers: Customer[],
): Promise<{ data: CustomerWithStats[]; error: string | null }> {
  if (customers.length === 0) {
    return { data: [], error: null };
  }

  const ids = customers.map((c) => c.id);

  const [bookingsRes, requestsRes] = await Promise.all([
    supabase
      .from("booking")
      .select("customer_id, sevice_request_id, created_at")
      .in("customer_id", ids),
    supabase
      .from("service-request")
      .select("customer_id, service_type, created_at")
      .in("customer_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  if (bookingsRes.error) {
    return { data: [], error: bookingsRes.error.message };
  }

  const bookingCounts = new Map<string, number>();
  const latestBookingSr = new Map<string, string>();

  for (const row of bookingsRes.data ?? []) {
    const cid = String(row.customer_id);
    bookingCounts.set(cid, (bookingCounts.get(cid) ?? 0) + 1);
    if (!latestBookingSr.has(cid) && row.sevice_request_id) {
      latestBookingSr.set(cid, String(row.sevice_request_id));
    }
  }

  const srIds = [...new Set(latestBookingSr.values())];
  const srServiceMap = new Map<string, string>();

  if (srIds.length > 0) {
    const { data: srRows } = await supabase
      .from("service-request")
      .select("id, service_type")
      .in("id", srIds);

    for (const sr of srRows ?? []) {
      srServiceMap.set(String(sr.id), String(sr.service_type));
    }
  }

  const latestRequestService = new Map<string, string>();
  for (const row of requestsRes.data ?? []) {
    const cid = String(row.customer_id);
    if (!latestRequestService.has(cid)) {
      latestRequestService.set(cid, String(row.service_type));
    }
  }

  const enriched = customers.map((customer) => {
    const srId = latestBookingSr.get(customer.id);
    const fromBooking = srId ? srServiceMap.get(srId) : null;
    const last_service =
      fromBooking ?? latestRequestService.get(customer.id) ?? null;

    return {
      ...customer,
      booking_count: bookingCounts.get(customer.id) ?? 0,
      last_service,
    };
  });

  return { data: enriched, error: null };
}

export async function getCustomerStats(
  supabase: SupabaseClient,
): Promise<{
  total: number;
  active: number;
  blocked: number;
  whatsappVerified: number;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("status, is_blocked, is_whatsapp_verified")
    .is("deleted_at", null);

  if (error) {
    return {
      total: 0,
      active: 0,
      blocked: 0,
      whatsappVerified: 0,
      error: error.message,
    };
  }

  const rows = data ?? [];
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === "active" && !r.is_blocked).length,
    blocked: rows.filter((r) => r.is_blocked).length,
    whatsappVerified: rows.filter((r) => r.is_whatsapp_verified).length,
    error: null,
  };
}
