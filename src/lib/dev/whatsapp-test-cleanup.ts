import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWhatsAppMobile } from "@/lib/whatsapp/parser";

/** Remove test customer data for manual simulator / script cleanup. */
export async function resetWhatsAppTestCustomer(
  supabase: SupabaseClient,
  rawMobile: string,
): Promise<{ ok: boolean; error: string | null }> {
  const mobile = normalizeWhatsAppMobile(rawMobile);

  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("service_request_id, customer_id")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  if (conv?.service_request_id) {
    const srId = conv.service_request_id;
    await supabase.from("worker_service_offers").delete().eq("service_request_id", srId);
    const { data: bookings } = await supabase
      .from("booking")
      .select("id")
      .eq("sevice_request_id", srId);
    for (const b of bookings ?? []) {
      await supabase.from("booking").delete().eq("id", b.id);
    }
    await supabase.from("service-request").delete().eq("id", srId);
  }

  await supabase
    .from("whatsapp_processed_events")
    .delete()
    .eq("whatsapp_mobile", mobile);

  await supabase
    .from("whatsapp_conversations")
    .delete()
    .eq("whatsapp_mobile", mobile);

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("mobile", mobile)
    .maybeSingle();

  if (customer?.id) {
    const { data: srs } = await supabase
      .from("service-request")
      .select("id")
      .eq("customer_id", customer.id);
    for (const sr of srs ?? []) {
      await supabase.from("worker_service_offers").delete().eq("service_request_id", sr.id);
      const { data: bookings } = await supabase
        .from("booking")
        .select("id")
        .eq("sevice_request_id", sr.id);
      for (const b of bookings ?? []) {
        await supabase.from("booking").delete().eq("id", b.id);
      }
    }
    await supabase.from("service-request").delete().eq("customer_id", customer.id);
    await supabase.from("customers").delete().eq("id", customer.id);
  }

  return { ok: true, error: null };
}
