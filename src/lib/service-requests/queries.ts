import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceRequest, ServiceRequestStatus } from "./types";
import type { Customer } from "@/lib/customers/types";

const TABLE = "service-request";

export interface ServiceRequestCreateInput {
  original_message: string;
  service_type: string;
  issue_type?: string | null;
  preferred_time_slot: string;
  area: string;
  pincode: string;
  address?: string | null;
  service_date: string;
  customer_id: string;
  customer_mobile?: string | null;
  service_frequency?: string | null;
  service_duration?: string | null;
  status?: ServiceRequestStatus;
  rate_card_sent?: boolean;
  rate_card_accepted?: boolean;
}

export type ServiceRequestUpdateInput = Partial<ServiceRequestCreateInput>;

export interface ServiceRequestListOptions {
  status?: string;
  search?: string;
  limit?: number;
}

export interface ServiceRequestWithCustomer extends ServiceRequest {
  customer?: Pick<Customer, "id" | "name" | "mobile"> | null;
}

function normalize(row: Record<string, unknown>): ServiceRequest {
  return row as unknown as ServiceRequest;
}

export async function listServiceRequests(
  supabase: SupabaseClient,
  options: ServiceRequestListOptions = {},
): Promise<{ data: ServiceRequestWithCustomer[]; error: string | null }> {
  let query = supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  if (options.search?.trim()) {
    const term = options.search.trim();
    query = query.or(
      `service_type.ilike.%${term}%,customer_mobile.ilike.%${term}%,area.ilike.%${term}%`,
    );
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  const requests = (data ?? []).map((row) =>
    normalize(row as Record<string, unknown>),
  );

  const customerIds = [...new Set(requests.map((r) => r.customer_id))];
  const customerMap = new Map<string, Pick<Customer, "id" | "name" | "mobile">>();

  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name, mobile")
      .in("id", customerIds);

    for (const c of customers ?? []) {
      customerMap.set(String(c.id), {
        id: String(c.id),
        name: String(c.name),
        mobile: String(c.mobile),
      });
    }
  }

  return {
    data: requests.map((r) => ({
      ...r,
      customer: customerMap.get(r.customer_id) ?? null,
    })),
    error: null,
  };
}

export async function getServiceRequestById(
  supabase: SupabaseClient,
  id: string,
): Promise<{
  data: ServiceRequestWithCustomer | null;
  error: string | null;
  notFound: boolean;
}> {
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

  const request = normalize(data as Record<string, unknown>);

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, mobile, alternate_mobile, area, pincode, address_line")
    .eq("id", request.customer_id)
    .maybeSingle();

  return {
    data: {
      ...request,
      customer: customer
        ? {
            id: String(customer.id),
            name: String(customer.name),
            mobile: String(customer.mobile),
          }
        : null,
    },
    error: null,
    notFound: false,
  };
}

export async function createServiceRequest(
  supabase: SupabaseClient,
  input: ServiceRequestCreateInput,
): Promise<{ data: ServiceRequest | null; error: string | null }> {
  const payload = {
    original_message: input.original_message.trim(),
    service_type: input.service_type.trim(),
    issue_type: input.issue_type?.trim() || null,
    preferred_time_slot: input.preferred_time_slot.trim(),
    area: input.area.trim(),
    pincode: input.pincode.trim(),
    address: input.address?.trim() || null,
    service_date: input.service_date,
    customer_id: input.customer_id,
    customer_mobile: input.customer_mobile?.trim() || null,
    service_frequency: input.service_frequency?.trim() || null,
    service_duration: input.service_duration?.trim() || null,
    status: input.status ?? "new",
    rate_card_sent: input.rate_card_sent ?? false,
    rate_card_accepted: input.rate_card_accepted ?? false,
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

export async function updateServiceRequestStatus(
  supabase: SupabaseClient,
  id: string,
  status: ServiceRequestStatus,
): Promise<{ data: ServiceRequest | null; error: string | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status })
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

export async function updateRateCardSent(
  supabase: SupabaseClient,
  id: string,
  sent: boolean,
): Promise<{ data: ServiceRequest | null; error: string | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ rate_card_sent: sent })
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

export async function updateRateCardAccepted(
  supabase: SupabaseClient,
  id: string,
  accepted: boolean,
): Promise<{ data: ServiceRequest | null; error: string | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ rate_card_accepted: accepted })
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

export async function getServiceRequestStats(
  supabase: SupabaseClient,
): Promise<{
  total: number;
  newCount: number;
  rateCardPending: number;
  error: string | null;
}> {
  const { data, error } = await supabase.from(TABLE).select("status, rate_card_accepted");

  if (error) {
    return { total: 0, newCount: 0, rateCardPending: 0, error: error.message };
  }

  const rows = data ?? [];
  return {
    total: rows.length,
    newCount: rows.filter((r) => r.status === "new").length,
    rateCardPending: rows.filter((r) => !r.rate_card_accepted).length,
    error: null,
  };
}
