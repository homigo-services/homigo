import type { ServiceRateCard } from "./types";

function toAmount(value: number | string): number {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
}

export interface CalculatedBookingAmounts {
  base_amount: number;
  lead_charge: number;
  platform_commission: number;
  final_amount: number;
  worker_earning: number;
}

/**
 * Deterministic amounts from a rate card row.
 * Uses stored schema fields — no invented percentages.
 *
 * final_amount = base_amount + lead_charge (customer-facing service amount)
 * worker_earning = final_amount - platform_commission - lead_charge
 */
export function calculateBookingAmounts(
  card: Pick<
    ServiceRateCard,
    "base_amount" | "lead_charge" | "platform_commission" | "worker_earning"
  >,
): CalculatedBookingAmounts {
  const base_amount = toAmount(card.base_amount);
  const lead_charge = toAmount(card.lead_charge);
  const platform_commission = toAmount(card.platform_commission);
  const final_amount = base_amount + lead_charge;
  const worker_earning = final_amount - platform_commission - lead_charge;

  return {
    base_amount,
    lead_charge,
    platform_commission,
    final_amount,
    worker_earning,
  };
}

/** Compare calculated worker_earning against stored card.worker_earning. */
export function validateRateCardConsistency(
  card: Pick<
    ServiceRateCard,
    "base_amount" | "lead_charge" | "platform_commission" | "worker_earning"
  >,
): { consistent: boolean; calculated: CalculatedBookingAmounts; storedWorkerEarning: number } {
  const calculated = calculateBookingAmounts(card);
  const storedWorkerEarning = toAmount(card.worker_earning);
  const consistent =
    Math.abs(calculated.worker_earning - storedWorkerEarning) < 0.01;

  return { consistent, calculated, storedWorkerEarning };
}
