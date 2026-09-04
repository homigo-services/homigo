import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import { getConversationByMobile, updateConversation } from "@/lib/whatsapp/conversation";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import { WORKER_NOT_FOUND_CUSTOMER } from "./worker-messages";

/** Notify customers whose service request reached worker_not_found. */
export async function sendWorkerNotFoundMessages(supabase: SupabaseClient): Promise<number> {
  const { data: rows } = await supabase
    .from("service-request")
    .select("id, customer_mobile, status")
    .eq("status", "worker_not_found")
    .limit(50);

  let sent = 0;
  for (const sr of rows ?? []) {
    const mobile = String(sr.customer_mobile ?? "");
    if (!mobile) continue;

    const conv = await getConversationByMobile(supabase, mobile);
    const lang = (conv.data?.preferred_language ?? "mr") as CustomerPreferredLanguage;
    const ctx = conv.data?.context as Record<string, unknown> | undefined;
    if (ctx?.worker_not_found_notified) continue;

    const message = WORKER_NOT_FOUND_CUSTOMER[lang] ?? WORKER_NOT_FOUND_CUSTOMER.mr;
    const result = await sendWhatsAppText(mobile, message);
    if (!result.ok) continue;

    if (conv.data) {
      await updateConversation(supabase, conv.data.id, {
        context: { ...ctx, worker_not_found_notified: true },
        last_message_at: new Date().toISOString(),
      });
    }
    sent += 1;
  }

  return sent;
}
