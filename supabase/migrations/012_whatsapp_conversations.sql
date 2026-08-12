-- Phase 0: persistent WhatsApp conversation state (webhook FSM implemented later).

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID
    REFERENCES public.customers (id),
  whatsapp_mobile TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'mr',
  state TEXT NOT NULL DEFAULT 'language_selection',
  service_request_id UUID
    REFERENCES public."service-request" (id),
  booking_id UUID
    REFERENCES public.booking (id),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_message_id TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversations_mobile_unique
    UNIQUE (whatsapp_mobile),
  CONSTRAINT whatsapp_conversations_language_valid
    CHECK (preferred_language IN ('mr', 'en', 'hi')),
  CONSTRAINT whatsapp_conversations_state_valid
    CHECK (state IN (
      'language_selection',
      'alternate_mobile_confirmation',
      'service_selection',
      'rate_card_confirmation',
      'date_selection',
      'slot_selection',
      'address_collection',
      'pincode_collection',
      'booking_confirmation',
      'worker_assignment',
      'booking_confirmed',
      'service_in_progress',
      'service_completion',
      'payment_pending',
      'completed',
      'cancelled',
      'reschedule'
    ))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_customer_id
  ON public.whatsapp_conversations (customer_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_state
  ON public.whatsapp_conversations (state);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_updated_at
  ON public.whatsapp_conversations (updated_at);

COMMENT ON TABLE public.whatsapp_conversations IS
  'One row per WhatsApp mobile. State machine transitions implemented in webhook layer.';

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
