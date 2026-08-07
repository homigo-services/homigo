-- Audit: who verified/rejected a worker document (optional admin user id/email)
ALTER TABLE public.worker_documents
  ADD COLUMN IF NOT EXISTS verified_by TEXT;

COMMENT ON COLUMN public.worker_documents.verified_by IS
  'Admin identifier (email or user id) who last verified/rejected the document';
