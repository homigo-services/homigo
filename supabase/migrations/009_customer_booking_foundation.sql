-- Phase 0: secure service-completion OTP columns on booking + query indexes.
-- Does NOT modify service_completion_otp (legacy timestamptz column — do not store OTP there).

-- ---------------------------------------------------------------------------
-- 1. Booking OTP fields (hashed OTP only; never plaintext in DB)
-- ---------------------------------------------------------------------------
ALTER TABLE public.booking
  ADD COLUMN IF NOT EXISTS completion_otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS otp_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.booking.completion_otp_hash IS
  'Bcrypt/sha256 hash of the numeric service-completion OTP. Do not use service_completion_otp for OTP storage.';
COMMENT ON COLUMN public.booking.otp_generated_at IS
  'When the current completion OTP was generated.';
COMMENT ON COLUMN public.booking.otp_expires_at IS
  'When the current completion OTP expires.';
COMMENT ON COLUMN public.booking.otp_attempts IS
  'Failed OTP verification attempts for the current OTP window.';

-- ---------------------------------------------------------------------------
-- 2. Indexes for upcoming customer/booking queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_booking_customer_id
  ON public.booking (customer_id);

CREATE INDEX IF NOT EXISTS idx_booking_worker_id
  ON public.booking (worker_id);

CREATE INDEX IF NOT EXISTS idx_booking_booking_status
  ON public.booking (booking_status);

CREATE INDEX IF NOT EXISTS idx_booking_service_date
  ON public.booking (service_date);

CREATE INDEX IF NOT EXISTS idx_service_request_customer_id
  ON public."service-request" (customer_id);

CREATE INDEX IF NOT EXISTS idx_service_request_status
  ON public."service-request" (status);

CREATE INDEX IF NOT EXISTS idx_customers_status
  ON public.customers (status);

CREATE INDEX IF NOT EXISTS idx_customers_pincode
  ON public.customers (pincode);

CREATE INDEX IF NOT EXISTS idx_customers_area
  ON public.customers (area);

-- Existing tables (customers, service-request, booking) RLS is unchanged here.
