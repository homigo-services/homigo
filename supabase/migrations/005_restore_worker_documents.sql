-- Restore worker_documents for table-based document storage (temporary until Storage refactor)
-- Safe to run even if table already exists.

CREATE TABLE IF NOT EXISTS public.worker_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_documents_worker_id
  ON public.worker_documents (worker_id);

CREATE INDEX IF NOT EXISTS idx_worker_documents_worker_type
  ON public.worker_documents (worker_id, document_type);

ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "homigo_worker_documents_select" ON public.worker_documents;
CREATE POLICY "homigo_worker_documents_select"
  ON public.worker_documents FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "homigo_worker_documents_insert" ON public.worker_documents;
CREATE POLICY "homigo_worker_documents_insert"
  ON public.worker_documents FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "homigo_worker_documents_update" ON public.worker_documents;
CREATE POLICY "homigo_worker_documents_update"
  ON public.worker_documents FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "homigo_worker_documents_delete" ON public.worker_documents;
CREATE POLICY "homigo_worker_documents_delete"
  ON public.worker_documents FOR DELETE
  USING (true);

-- Registration must not fail on last_login_at
ALTER TABLE public.workers
  ALTER COLUMN last_login_at DROP NOT NULL;
