-- Phase 0: WhatsApp webhook idempotency (no full payloads or secrets stored).

CREATE TABLE IF NOT EXISTS public.whatsapp_processed_events (
  message_id TEXT PRIMARY KEY,
  event_type TEXT,
  whatsapp_mobile TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'processed',
  payload_hash TEXT,
  error_message TEXT,
  CONSTRAINT whatsapp_processed_events_status_valid
    CHECK (status IN ('processed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_events_received_at
  ON public.whatsapp_processed_events (received_at);

COMMENT ON TABLE public.whatsapp_processed_events IS
  'Idempotency ledger for inbound WhatsApp webhook events. message_id is the dedupe key.';

ALTER TABLE public.whatsapp_processed_events ENABLE ROW LEVEL SECURITY;
