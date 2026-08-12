-- Phase 4B: atomic worker offer acceptance (one winner per service request).

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_service_offers_one_winner
  ON public.worker_service_offers (service_request_id)
  WHERE status = 'accepted';

CREATE OR REPLACE FUNCTION public.accept_worker_service_offer(
  p_offer_id UUID,
  p_token_hash TEXT,
  p_customer_id UUID,
  p_service_date DATE,
  p_service_time_slot TEXT,
  p_base_amount NUMERIC,
  p_lead_charge NUMERIC,
  p_platform_commission NUMERIC,
  p_worker_earning NUMERIC,
  p_final_amount NUMERIC
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
    AND accept_token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF v_offer.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
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
    'offer_id', v_offer.id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_already_assigned');
END;
$$;

COMMENT ON FUNCTION public.accept_worker_service_offer IS
  'Atomically accept one worker offer, cancel siblings, create booking, mark worker unavailable.';
