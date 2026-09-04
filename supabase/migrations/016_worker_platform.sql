-- Migration 016: Worker platform foundation (sessions, notifications, canonical offer RPCs).
-- MANUAL EXECUTION ONLY — do not auto-apply to production.
-- Depends on: 011_worker_service_offers.sql, 014_worker_offer_acceptance.sql
--
-- COMPATIBILITY NOTE:
-- An earlier 016 draft (applied on some environments) created worker_sessions with
-- column "token_hash", NOT "session_token_hash". This migration uses token_hash as
-- the canonical column name and only ADDs missing columns — never drops tables.

-- ---------------------------------------------------------------------------
-- 1. Worker sessions (PWA / app login — Phase 6+)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe column adds for both fresh installs and earlier 016 draft schemas.
ALTER TABLE public.worker_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Unique lookup by hashed session token (canonical column: token_hash).
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_sessions_token_hash
  ON public.worker_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_worker_sessions_worker_id
  ON public.worker_sessions (worker_id);

CREATE INDEX IF NOT EXISTS idx_worker_sessions_expires_at
  ON public.worker_sessions (expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.worker_sessions IS
  'Authenticated worker sessions. Raw session tokens are never stored — only SHA-256 hashes in token_hash.';

COMMENT ON COLUMN public.worker_sessions.token_hash IS
  'SHA-256 hash of the httpOnly session cookie token. Raw token is never stored.';

ALTER TABLE public.worker_sessions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Notification delivery audit (App + WhatsApp + SMS orchestrator)
--    Distinct from legacy worker_notifications / worker_notification_deliveries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES public.worker_service_offers (id) ON DELETE SET NULL,
  worker_id UUID NOT NULL REFERENCES public.workers (id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'worker_offer',
  status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_records_channel_valid
    CHECK (channel IN ('app', 'whatsapp', 'sms')),
  CONSTRAINT notification_records_status_valid
    CHECK (status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_notification_records_offer_id
  ON public.notification_records (offer_id);

CREATE INDEX IF NOT EXISTS idx_notification_records_worker_id
  ON public.notification_records (worker_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_records_idempotency
  ON public.notification_records (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE public.notification_records IS
  'Per-channel worker notification attempts with idempotency for safe retries.';

ALTER TABLE public.notification_records ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. SMS inbound idempotency (provider webhook deduplication)
--    Earlier 016 draft used (provider, event_id); canonical name is provider_event_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_inbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'generic',
  provider_event_id TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extend legacy sms_inbound_events if an earlier draft already created it.
ALTER TABLE public.sms_inbound_events
  ADD COLUMN IF NOT EXISTS payload JSONB,
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sms_inbound_events'
      AND column_name = 'event_id'
  ) THEN
    UPDATE public.sms_inbound_events
    SET provider_event_id = event_id
    WHERE provider_event_id IS NULL
      AND event_id IS NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_inbound_events_provider_event_id
  ON public.sms_inbound_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_inbound_events_processed_at
  ON public.sms_inbound_events (processed_at);

COMMENT ON TABLE public.sms_inbound_events IS
  'Dedupes inbound SMS webhooks so accept/reject actions run at most once per provider event.';

ALTER TABLE public.sms_inbound_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Offer rejection audit column (channel that performed reject)
-- ---------------------------------------------------------------------------
ALTER TABLE public.worker_service_offers
  ADD COLUMN IF NOT EXISTS rejected_via TEXT;

COMMENT ON COLUMN public.worker_service_offers.rejected_via IS
  'Channel that rejected the offer: app, whatsapp, sms, or token_link.';

-- ---------------------------------------------------------------------------
-- 5. Batch expiry query index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_worker_service_offers_pending_expires
  ON public.worker_service_offers (expires_at, status)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 6. Canonical accept by offer_id + worker_id (App / WhatsApp / SMS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_worker_service_offer_by_id(
  p_offer_id UUID,
  p_worker_id UUID,
  p_customer_id UUID,
  p_service_date DATE,
  p_service_time_slot TEXT,
  p_base_amount NUMERIC,
  p_lead_charge NUMERIC,
  p_platform_commission NUMERIC,
  p_worker_earning NUMERIC,
  p_final_amount NUMERIC,
  p_channel TEXT DEFAULT 'app'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.worker_service_offers%ROWTYPE;
  v_sr public."service-request"%ROWTYPE;
  v_booking_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_offer
  FROM public.worker_service_offers
  WHERE id = p_offer_id
    AND worker_id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_found');
  END IF;

  IF v_offer.status = 'accepted' AND v_offer.worker_id = p_worker_id THEN
    SELECT id INTO v_booking_id
    FROM public.booking
    WHERE sevice_request_id = v_offer.service_request_id
      AND worker_id = p_worker_id
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', true,
      'booking_id', v_booking_id,
      'worker_id', v_offer.worker_id,
      'service_request_id', v_offer.service_request_id,
      'offer_id', v_offer.id,
      'idempotent', true
    );
  END IF;

  IF v_offer.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_pending');
  END IF;

  IF v_offer.expires_at <= v_now THEN
    UPDATE public.worker_service_offers
    SET status = 'expired', updated_at = v_now
    WHERE id = v_offer.id;
    RETURN jsonb_build_object('ok', false, 'error', 'offer_expired');
  END IF;

  SELECT * INTO v_sr
  FROM public."service-request"
  WHERE id = v_offer.service_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'service_request_not_found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.worker_service_offers
    WHERE service_request_id = v_offer.service_request_id
      AND status = 'accepted'
      AND id <> v_offer.id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_already_assigned');
  END IF;

  IF v_sr.rate_card_accepted IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_card_not_accepted');
  END IF;

  UPDATE public.worker_service_offers
  SET
    status = 'accepted',
    accepted_at = v_now,
    updated_at = v_now
  WHERE id = v_offer.id;

  UPDATE public.worker_service_offers
  SET
    status = 'cancelled',
    updated_at = v_now
  WHERE service_request_id = v_offer.service_request_id
    AND status = 'pending'
    AND id <> v_offer.id;

  INSERT INTO public.booking (
    sevice_request_id,
    customer_id,
    worker_id,
    service_date,
    service_time_slot,
    booking_status,
    payment_status,
    base_amount,
    lead_charge,
    platform_commission,
    final_amount,
    worker_earning,
    updated_at
  )
  VALUES (
    v_offer.service_request_id,
    p_customer_id,
    v_offer.worker_id,
    p_service_date,
    split_part(p_service_time_slot, '-', 1)::time,
    'assigned',
    'pending',
    p_base_amount,
    p_lead_charge,
    p_platform_commission,
    p_final_amount,
    p_worker_earning,
    v_now
  )
  RETURNING id INTO v_booking_id;

  UPDATE public."service-request"
  SET status = 'assigned'
  WHERE id = v_offer.service_request_id;

  UPDATE public.workers
  SET
    is_available = false,
    updated_at = v_now
  WHERE id = v_offer.worker_id;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'worker_id', v_offer.worker_id,
    'service_request_id', v_offer.service_request_id,
    'offer_id', v_offer.id,
    'channel', p_channel
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_already_assigned');
END;
$$;

COMMENT ON FUNCTION public.accept_worker_service_offer_by_id IS
  'Atomically accept a worker offer by offer_id + worker_id (App/WhatsApp/SMS). Idempotent for same worker.';

-- ---------------------------------------------------------------------------
-- 7. Canonical reject by offer_id + worker_id
--    Replace earlier 2-arg draft; p_channel defaults to app for backward compat.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reject_worker_service_offer(UUID, UUID);

CREATE OR REPLACE FUNCTION public.reject_worker_service_offer(
  p_offer_id UUID,
  p_worker_id UUID,
  p_channel TEXT DEFAULT 'app'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.worker_service_offers%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_offer
  FROM public.worker_service_offers
  WHERE id = p_offer_id
    AND worker_id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_found');
  END IF;

  IF v_offer.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'service_request_id', v_offer.service_request_id,
      'offer_id', v_offer.id,
      'idempotent', true
    );
  END IF;

  IF v_offer.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.worker_service_offers
    WHERE service_request_id = v_offer.service_request_id
      AND status = 'accepted'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_already_assigned');
  END IF;

  IF v_offer.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_pending');
  END IF;

  IF v_offer.expires_at <= v_now THEN
    UPDATE public.worker_service_offers
    SET status = 'expired', updated_at = v_now
    WHERE id = v_offer.id;
    RETURN jsonb_build_object('ok', false, 'error', 'offer_expired');
  END IF;

  UPDATE public.worker_service_offers
  SET
    status = 'rejected',
    rejected_at = v_now,
    rejected_via = p_channel,
    updated_at = v_now
  WHERE id = v_offer.id;

  RETURN jsonb_build_object(
    'ok', true,
    'service_request_id', v_offer.service_request_id,
    'offer_id', v_offer.id,
    'channel', p_channel
  );
END;
$$;

COMMENT ON FUNCTION public.reject_worker_service_offer IS
  'Reject a pending worker offer. Rejected workers are excluded from future batches for the same request.';

-- ---------------------------------------------------------------------------
-- 8. Expire pending offers for a batch (scheduler helper — Phase 10)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_pending_worker_offers(
  p_service_request_id UUID,
  p_batch_number INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expired INTEGER := 0;
BEGIN
  UPDATE public.worker_service_offers
  SET
    status = 'expired',
    updated_at = v_now
  WHERE service_request_id = p_service_request_id
    AND batch_number = p_batch_number
    AND status = 'pending'
    AND expires_at <= v_now;

  GET DIAGNOSTICS v_expired = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'expired_count', v_expired,
    'service_request_id', p_service_request_id,
    'batch_number', p_batch_number
  );
END;
$$;

COMMENT ON FUNCTION public.expire_pending_worker_offers IS
  'Idempotently expire pending offers past expires_at for a service request batch.';

-- Reuse existing objects (do NOT recreate):
--   public.worker_service_offers (011)
--   public.accept_worker_service_offer (014)
--   idx_worker_service_offers_one_winner (014)
-- Legacy objects from earlier 016 draft (left untouched):
--   worker_login_otps, worker_channel_context, worker_notifications,
--   worker_notification_deliveries, worker_earnings_ledger
