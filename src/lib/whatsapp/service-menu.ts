import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import { fetchServiceCatalog } from "@/lib/workers/service-resolver";
import type { Service } from "@/lib/workers/types";

export interface ServiceMenuEntry {
  index: number;
  id: string;
  name: string;
}

const MENU_HEADERS: Record<CustomerPreferredLanguage, string> = {
  en: "Please select a service:",
  mr: "कृपया एक service निवडा:",
  hi: "कृपया एक service चुनें:",
};

const MENU_EMPTY: Record<CustomerPreferredLanguage, string> = {
  en: "Sorry, no services are available right now. Please contact Homigo support.",
  mr: "क्षमस्व, सध्या कोणतीही service उपलब्ध नाही. कृपया Homigo support शी संपर्क साधा.",
  hi: "क्षमा करें, अभी कोई service उपलब्ध नहीं है। कृपया Homigo support से संपर्क करें।",
};

export function buildServiceMenuMessage(
  services: Service[],
  lang: CustomerPreferredLanguage,
): { body: string; menu: ServiceMenuEntry[] } {
  if (services.length === 0) {
    return { body: MENU_EMPTY[lang], menu: [] };
  }

  const menu: ServiceMenuEntry[] = services.map((service, i) => ({
    index: i + 1,
    id: service.id,
    name: service.name,
  }));

  const lines = menu.map((entry) => `${entry.index}. ${entry.name}`);
  const body = `${MENU_HEADERS[lang]}\n\n${lines.join("\n")}\n\nReply with the service number.`;

  return { body, menu };
}

export async function loadServiceMenu(
  supabase: SupabaseClient,
  lang: CustomerPreferredLanguage,
): Promise<{
  body: string;
  menu: ServiceMenuEntry[];
  error: string | null;
}> {
  const { data, error } = await fetchServiceCatalog(supabase);

  if (error) {
    return { body: "", menu: [], error };
  }

  const { data: activeRows } = await supabase
    .from("services")
    .select("id")
    .eq("is_active", true);

  const activeIds = new Set((activeRows ?? []).map((row) => String(row.id)));
  const activeServices =
    activeIds.size > 0
      ? data.filter((service) => activeIds.has(service.id))
      : data;

  const { body, menu } = buildServiceMenuMessage(activeServices, lang);
  return { body, menu, error: null };
}

export function resolveServiceFromMenu(
  text: string,
  menu: ServiceMenuEntry[],
): ServiceMenuEntry | null {
  const n = Number.parseInt(text.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return menu.find((entry) => entry.index === n) ?? null;
}
