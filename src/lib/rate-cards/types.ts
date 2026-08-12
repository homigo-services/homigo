/** Matches `public.service_rate_cards` (migration 010). */
export interface ServiceRateCard {
  id: string;
  service_id: string;
  base_amount: number;
  lead_charge: number;
  platform_commission: number;
  worker_earning: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export interface ServiceRateCardWithService extends ServiceRateCard {
  service_name: string;
}
