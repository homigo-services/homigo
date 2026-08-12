import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer } from "@/lib/customers/types";
import type { ServiceRequest } from "@/lib/service-requests/types";
import type {
  Booking,
  BookingStatus,
  PaymentMode,
  PaymentStatus,
} from "./types";

const TABLE = "booking";

export interface BookingCreateInput {
  sevice_request_id: string;
  customer_id: string;
  worker_id: string;
  service_date: string;
  service_time_slot?: string | null;
  booking_status?: BookingStatus;
  payment_status?: PaymentStatus;
  Payment_mode?: PaymentMode | null;
  base_amount?: number;
  platform_commission?: number;
  lead_charge?: number;
  final_amount?: number;
  worker_earning?: number;
  notes?: string | null;
}

export interface BookingListOptions {
  status?: string;
  paymentStatus?: string;
  search?: string;
  limit?: number;
}

export interface BookingListItem {
  id: string;
  customer_name: string;
  customer_mobile: string;
  service_type: string;
  worker_name: string;
  service_date: string;
  service_time_slot: string | null;
  final_amount: number;
  payment_status: PaymentStatus;
  booking_status: BookingStatus;
  Payment_mode: PaymentMode | null;
}

export interface BookingWorkerSummary {
  id: string;
  name: string;
  mobile: string;
  rating: number;
  photo_url: string | null;
}

export interface BookingDetail extends Booking {
  customer: Customer | null;
  worker: BookingWorkerSummary | null;
  service_request: ServiceRequest | null;
  has_active_otp: boolean;
}

function normalizeBooking(row: Record<string, unknown>): Booking {
  return row as unknown as Booking;
}

function getWorkerName(row: Record<string, unknown>): string {
  const fullName = row["Full name"];
  return typeof fullName === "string" && fullName.trim()
    ? fullName.trim()
    : "Unassigned";
}

export async function listBookings(
  supabase: SupabaseClient,
  options: BookingListOptions = {},
): Promise<{ data: BookingListItem[]; error: string | null }> {
  let query = supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (options.status && options.status !== "all") {
    query = query.eq("booking_status", options.status);
  }

  if (options.paymentStatus && options.paymentStatus !== "all") {
    query = query.eq("payment_status", options.paymentStatus);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: bookings, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  const rows = bookings ?? [];
  const customerIds = [...new Set(rows.map((b) => String(b.customer_id)))];
  const workerIds = [...new Set(rows.map((b) => String(b.worker_id)))];
  const srIds = [...new Set(rows.map((b) => String(b.sevice_request_id)))];

  const [customersRes, workersRes, srRes] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name, mobile").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    workerIds.length
      ? supabase
          .from("workers")
          .select('id, "Full name", mobile_number')
          .in("id", workerIds)
      : Promise.resolve({ data: [], error: null }),
    srIds.length
      ? supabase.from("service-request").select("id, service_type").in("id", srIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customersRes.error) {
    return { data: [], error: customersRes.error.message };
  }
  if (workersRes.error) {
    return { data: [], error: workersRes.error.message };
  }
  if (srRes.error) {
    return { data: [], error: srRes.error.message };
  }

  const customerMap = new Map(
    (customersRes.data ?? []).map((c) => [
      String(c.id),
      { name: String(c.name), mobile: String(c.mobile) },
    ]),
  );
  const workerMap = new Map(
    (workersRes.data ?? []).map((w) => [
      String(w.id),
      getWorkerName(w as Record<string, unknown>),
    ]),
  );
  const srMap = new Map(
    (srRes.data ?? []).map((sr) => [String(sr.id), String(sr.service_type)]),
  );

  let items: BookingListItem[] = rows.map((row) => {
    const b = normalizeBooking(row as Record<string, unknown>);
    const customer = customerMap.get(b.customer_id);
    return {
      id: b.id,
      customer_name: customer?.name ?? "Unknown",
      customer_mobile: customer?.mobile ?? "",
      service_type: srMap.get(b.sevice_request_id) ?? "—",
      worker_name: workerMap.get(b.worker_id) ?? "Unassigned",
      service_date: b.service_date,
      service_time_slot: b.service_time_slot,
      final_amount: Number(b.final_amount),
      payment_status: b.payment_status,
      booking_status: b.booking_status,
      Payment_mode: b.Payment_mode,
    };
  });

  if (options.search?.trim()) {
    const term = options.search.trim().toLowerCase();
    items = items.filter(
      (b) =>
        b.id.toLowerCase().includes(term) ||
        b.customer_name.toLowerCase().includes(term) ||
        b.customer_mobile.includes(term) ||
        b.service_type.toLowerCase().includes(term),
    );
  }

  return { data: items, error: null };
}

export async function getBookingById(
  supabase: SupabaseClient,
  id: string,
): Promise<{ data: BookingDetail | null; error: string | null; notFound: boolean }> {
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

  const booking = normalizeBooking(data as Record<string, unknown>);

  const [customerRes, workerRes, srRes] = await Promise.all([
    supabase.from("customers").select("*").eq("id", booking.customer_id).maybeSingle(),
    supabase
      .from("workers")
      .select('id, "Full name", mobile_number, rating, photo_url')
      .eq("id", booking.worker_id)
      .maybeSingle(),
    supabase
      .from("service-request")
      .select("*")
      .eq("id", booking.sevice_request_id)
      .maybeSingle(),
  ]);

  const customer = customerRes.data
    ? (customerRes.data as unknown as Customer)
    : null;

  const worker = workerRes.data
    ? {
        id: String(workerRes.data.id),
        name: getWorkerName(workerRes.data as Record<string, unknown>),
        mobile: String(workerRes.data.mobile_number ?? ""),
        rating: Number(workerRes.data.rating ?? 0),
        photo_url: (workerRes.data.photo_url as string | null) ?? null,
      }
    : null;

  const service_request = srRes.data
    ? (srRes.data as unknown as ServiceRequest)
    : null;

  const { completion_otp_hash, ...safeBooking } = booking;

  return {
    data: {
      ...safeBooking,
      completion_otp_hash: undefined,
      customer,
      worker,
      service_request,
      has_active_otp: Boolean(completion_otp_hash),
    },
    error: null,
    notFound: false,
  };
}

export async function createBooking(
  supabase: SupabaseClient,
  input: BookingCreateInput,
): Promise<{ data: Booking | null; error: string | null }> {
  const now = new Date().toISOString();
  const payload = {
    sevice_request_id: input.sevice_request_id,
    customer_id: input.customer_id,
    worker_id: input.worker_id,
    service_date: input.service_date,
    service_time_slot: input.service_time_slot ?? null,
    booking_status: input.booking_status ?? "pending",
    payment_status: input.payment_status ?? "pending",
    Payment_mode: input.Payment_mode ?? null,
    base_amount: input.base_amount ?? 0,
    platform_commission: input.platform_commission ?? 0,
    lead_charge: input.lead_charge ?? 0,
    final_amount: input.final_amount ?? 0,
    worker_earning: input.worker_earning ?? 0,
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
    data: normalizeBooking(data as Record<string, unknown>),
    error: null,
  };
}

export async function updateBookingStatus(
  supabase: SupabaseClient,
  id: string,
  booking_status: BookingStatus,
  cancel_reason?: string | null,
): Promise<{ data: Booking | null; error: string | null }> {
  const payload: Record<string, unknown> = {
    booking_status,
    updated_at: new Date().toISOString(),
  };

  if (cancel_reason !== undefined) {
    payload.cancel_reason = cancel_reason?.trim() || null;
  }

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
    data: normalizeBooking(data as Record<string, unknown>),
    error: null,
  };
}

export async function updateBookingNotes(
  supabase: SupabaseClient,
  id: string,
  notes: string | null,
): Promise<{ data: Booking | null; error: string | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ notes: notes?.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: normalizeBooking(data as Record<string, unknown>),
    error: null,
  };
}

export interface PaymentUpdateInput {
  payment_status: PaymentStatus;
  Payment_mode?: PaymentMode | null;
  final_amount?: number;
  platform_commission?: number;
  lead_charge?: number;
  worker_earning?: number;
  payment_received_at?: string | null;
}

export async function updatePaymentInformation(
  supabase: SupabaseClient,
  id: string,
  input: PaymentUpdateInput,
): Promise<{ data: Booking | null; error: string | null }> {
  const payload: Record<string, unknown> = {
    payment_status: input.payment_status,
    updated_at: new Date().toISOString(),
  };

  if (input.Payment_mode !== undefined) payload.Payment_mode = input.Payment_mode;
  if (input.final_amount !== undefined) payload.final_amount = input.final_amount;
  if (input.platform_commission !== undefined)
    payload.platform_commission = input.platform_commission;
  if (input.lead_charge !== undefined) payload.lead_charge = input.lead_charge;
  if (input.worker_earning !== undefined) payload.worker_earning = input.worker_earning;
  if (input.payment_received_at !== undefined)
    payload.payment_received_at = input.payment_received_at;

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
    data: normalizeBooking(data as Record<string, unknown>),
    error: null,
  };
}

export async function getBookingStats(
  supabase: SupabaseClient,
): Promise<{
  total: number;
  pending: number;
  assigned: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  totalRevenue: number;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("booking_status, final_amount, payment_status");

  if (error) {
    return {
      total: 0,
      pending: 0,
      assigned: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      totalRevenue: 0,
      error: error.message,
    };
  }

  const rows = data ?? [];
  const paid = rows.filter((r) => r.payment_status === "paid");

  return {
    total: rows.length,
    pending: rows.filter((r) => r.booking_status === "pending").length,
    assigned: rows.filter((r) => r.booking_status === "assigned").length,
    inProgress: rows.filter((r) => r.booking_status === "in_progress").length,
    completed: rows.filter((r) => r.booking_status === "completed").length,
    cancelled: rows.filter((r) => r.booking_status === "cancelled").length,
    totalRevenue: paid.reduce((sum, r) => sum + Number(r.final_amount ?? 0), 0),
    error: null,
  };
}

export async function listBookingsByCustomerId(
  supabase: SupabaseClient,
  customerId: string,
): Promise<{ data: BookingListItem[]; error: string | null }> {
  const { data: bookings, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const ids = (bookings ?? []).map((b) => normalizeBooking(b as Record<string, unknown>).id);
  if (ids.length === 0) {
    return { data: [], error: null };
  }

  const { data: all } = await listBookings(supabase, {});
  return {
    data: all.filter((b) => ids.includes(b.id)),
    error: null,
  };
}
