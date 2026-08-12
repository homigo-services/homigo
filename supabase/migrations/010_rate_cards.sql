-- Phase 0: service rate cards linked to public.services (no hardcoded pricing).

CREATE TABLE IF NOT EXISTS public.service_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services (id),
  base_amount NUMERIC NOT NULL DEFAULT 0,
  lead_charge NUMERIC NOT NULL DEFAULT 0,
  platform_commission NUMERIC NOT NULL DEFAULT 0,
  worker_earning NUMERIC NOT NULL DEFAULT 0,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  CONSTRAINT service_rate_cards_base_amount_non_negative
    CHECK (base_amount >= 0),
  CONSTRAINT service_rate_cards_lead_charge_non_negative
    CHECK (lead_charge >= 0),
  CONSTRAINT service_rate_cards_platform_commission_non_negative
    CHECK (platform_commission >= 0),
  CONSTRAINT service_rate_cards_worker_earning_non_negative
    CHECK (worker_earning >= 0),
  CONSTRAINT service_rate_cards_effective_range_valid
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_service_rate_cards_service_id
  ON public.service_rate_cards (service_id);

CREATE INDEX IF NOT EXISTS idx_service_rate_cards_is_active
  ON public.service_rate_cards (is_active);

CREATE INDEX IF NOT EXISTS idx_service_rate_cards_effective
  ON public.service_rate_cards (service_id, effective_from, effective_to)
  WHERE is_active = true;

COMMENT ON TABLE public.service_rate_cards IS
  'Per-service pricing. Populated by admin; WhatsApp/booking flows read active cards only.';

-- Restrictive RLS: no anon/authenticated policies; service-role API routes bypass RLS.
ALTER TABLE public.service_rate_cards ENABLE ROW LEVEL SECURITY;
