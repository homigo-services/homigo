import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import { fetchServiceCatalog } from "@/lib/workers/service-resolver";
import type { Service } from "@/lib/workers/types";
import { HOMIGO_BOOKING_SERVICE_NAMES } from "./homigo-services";

export interface ServiceMenuEntry {
  index: number;
  id: string;
  name: string;
}

const MENU_HEADERS: Record<CustomerPreferredLanguage, string> = {
  en: "Please select a service:",
  mr: "कृपया एक सेवा निवडा:",
  hi: "कृपया एक सेवा चुनें:",
};

const MENU_EMPTY: Record<CustomerPreferredLanguage, string> = {
  en: "Sorry, no services are available right now. Please contact Homigo support.",
  mr: "क्षमस्व, सध्या कोणतीही सेवा उपलब्ध नाही. कृपया Homigo सपोर्टशी संपर्क साधा.",
  hi: "क्षमा करें, अभी कोई सेवा उपलब्ध नहीं है। कृपया Homigo सपोर्ट से संपर्क करें।",
};

/** Keep only the 5 Homigo services in canonical order. */
export function filterHomigoBookingServices(services: Service[]): Service[] {
  const byName = new Map(services.map((s) => [s.name.trim().toLowerCase(), s]));
  const ordered: Service[] = [];
  for (const name of HOMIGO_BOOKING_SERVICE_NAMES) {
    const match = byName.get(name.toLowerCase());
    if (match) ordered.push(match);
  }
  return ordered;
}

export function buildServiceMenuMessage(
  services: Service[],
  lang: CustomerPreferredLanguage,
): { body: string; menu: ServiceMenuEntry[] } {
  const homigoServices = filterHomigoBookingServices(services);

  if (homigoServices.length === 0) {
    return { body: MENU_EMPTY[lang], menu: [] };
  }

  const menu: ServiceMenuEntry[] = homigoServices.map((service, i) => ({
    index: i + 1,
    id: service.id,
    name: service.name,
  }));

  const lines = menu.map((entry) => `${entry.index}. ${entry.name}`);
  const footers = {
    en: "Reply with the service number.",
    mr: "सेवा क्रमांक पाठवा.",
    hi: "सेवा क्रमांक भेजें।",
  };
  const body = `${MENU_HEADERS[lang]}\n\n${lines.join("\n")}\n\n${footers[lang]}`;

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

  const { data: activeRows, error: activeError } = await supabase
    .from("services")
    .select("id, service_name")
    .eq("is_active", true);

  const activeIds = new Set(
    activeError
      ? data.map((service) => service.id)
      : (activeRows ?? []).map((row) => String(row.id)),
  );
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
