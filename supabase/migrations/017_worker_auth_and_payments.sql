-- Worker OTP login + online payment persistence (apply after 016).
-- Idempotent — safe if legacy draft already created worker_login_otps.
-- MANUAL: run this entire file in Supabase SQL Editor after 016 is applied.

-- ---------------------------------------------------------------------------
-- 1. Worker login OTP (separate from customer completion OTP on booking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_login_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers (id) ON DELETE CASCADE,
  mobile TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_login_otps_worker_mobile
  ON public.worker_login_otps (worker_id, mobile, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_login_otps_mobile_created
  ON public.worker_login_otps (mobile, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_login_otps_pending
  ON public.worker_login_otps (worker_id, mobile)
  WHERE verified_at IS NULL;

COMMENT ON TABLE public.worker_login_otps IS
  'Worker app login OTP hashes — never store raw OTP. Separate from booking completion OTP.';

-- ---------------------------------------------------------------------------
-- 2. Online UPI payment records (Razorpay)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_online_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.booking (id) ON DELETE CASCADE,
  payment_mode TEXT NOT NULL DEFAULT 'upi',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT,
  provider_payment_id TEXT,
  provider_payment_link_id TEXT,
  payment_link_url TEXT,
  last_webhook_event_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_online_payments_booking_id
  ON public.booking_online_payments (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_online_payments_provider_order
  ON public.booking_online_payments (provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_online_payments_status
  ON public.booking_online_payments (payment_status, updated_at DESC);

COMMENT ON TABLE public.booking_online_payments IS
  'Razorpay UPI payment state per booking — idempotent webhook completion.';

-- ---------------------------------------------------------------------------
-- 3. Payment webhook idempotency (Razorpay + future providers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'razorpay',
  event_id TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_unique UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_processed
  ON public.payment_webhook_events (processed_at DESC);

COMMENT ON TABLE public.payment_webhook_events IS
  'Dedupes payment provider webhooks — prevents duplicate booking completion.';

-- ---------------------------------------------------------------------------
-- 4. RLS (service role bypasses; anon/authenticated blocked)
-- ---------------------------------------------------------------------------
ALTER TABLE public.worker_login_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_online_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
