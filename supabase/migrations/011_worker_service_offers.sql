-- Phase 0: worker acceptance offers (30-minute batches — logic implemented later).

CREATE TABLE IF NOT EXISTS public.worker_service_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL
    REFERENCES public."service-request" (id),
  worker_id UUID NOT NULL
    REFERENCES public.workers (id),
  batch_number INTEGER NOT NULL,
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  accept_token_hash TEXT NOT NULL,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_service_offers_batch_positive
    CHECK (batch_number > 0),
  CONSTRAINT worker_service_offers_expires_after_offered
    CHECK (expires_at > offered_at),
  CONSTRAINT worker_service_offers_status_valid
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_worker_service_offers_service_request_id
  ON public.worker_service_offers (service_request_id);

CREATE INDEX IF NOT EXISTS idx_worker_service_offers_worker_id
  ON public.worker_service_offers (worker_id);

CREATE INDEX IF NOT EXISTS idx_worker_service_offers_status
  ON public.worker_service_offers (status);

CREATE INDEX IF NOT EXISTS idx_worker_service_offers_expires_at
  ON public.worker_service_offers (expires_at);

-- Prevent duplicate pending/accepted offers for the same request + worker.
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_service_offers_unique_active
  ON public.worker_service_offers (service_request_id, worker_id)
  WHERE status IN ('pending', 'accepted');

COMMENT ON COLUMN public.worker_service_offers.accept_token_hash IS
  'Hash of the one-time accept token. Raw token is never stored.';

ALTER TABLE public.worker_service_offers ENABLE ROW LEVEL SECURITY;
