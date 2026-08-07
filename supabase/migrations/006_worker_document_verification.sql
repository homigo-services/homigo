-- Document verification audit fields on worker_documents (optional admin workflow)
ALTER TABLE public.worker_documents
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.worker_documents.verification_status IS
  'pending_review | verified | rejected | not_uploaded';
