import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateBookingAmounts,
  type CalculatedBookingAmounts,
} from "@/lib/rate-cards/calculator";
import { getActiveRateCardForService } from "@/lib/rate-cards/queries";
import type { ServiceRateCard } from "@/lib/rate-cards/types";
import { HOMIGO_SERVICE_BASE_PRICE } from "@/lib/whatsapp/homigo-services";

export interface ActiveRateCardResult {
  card: ServiceRateCard | null;
  amounts: CalculatedBookingAmounts | null;
  error: string | null;
}

/**
 * Fetch the currently effective rate card for a service on a given date.
 * Respects effective_from / effective_to and rejects inactive cards.
 */
export async function getActiveRateCard(
  supabase: SupabaseClient,
  serviceId: string,
  serviceDate: string | Date,
): Promise<ActiveRateCardResult> {
  const at =
    typeof serviceDate === "string"
      ? new Date(`${serviceDate}T12:00:00+05:30`)
      : serviceDate;

  const { data: card, error } = await getActiveRateCardForService(
    supabase,
    serviceId,
    at,
  );

  if (error) {
    return { card: null, amounts: null, error };
  }

  if (!card || !card.is_active) {
    return { card: null, amounts: null, error: null };
  }

  const amounts = calculateBookingAmounts(card);
  // Customer-facing service amount is always ₹1000 — DB splits must not change this.
  return {
    card,
    amounts: {
      ...amounts,
      final_amount: HOMIGO_SERVICE_BASE_PRICE,
    },
    error: null,
  };
}
