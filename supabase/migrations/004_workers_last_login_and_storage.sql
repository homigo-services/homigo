-- Fix registration failure: last_login_at must not block new workers
ALTER TABLE public.workers
  ALTER COLUMN last_login_at DROP NOT NULL;

-- Worker document storage bucket (Supabase Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-documents', 'worker-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for document previews
DROP POLICY IF EXISTS "homigo_worker_documents_storage_select" ON storage.objects;
CREATE POLICY "homigo_worker_documents_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'worker-documents');

-- Allow uploads until admin auth is added
DROP POLICY IF EXISTS "homigo_worker_documents_storage_insert" ON storage.objects;
CREATE POLICY "homigo_worker_documents_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'worker-documents');

DROP POLICY IF EXISTS "homigo_worker_documents_storage_update" ON storage.objects;
CREATE POLICY "homigo_worker_documents_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'worker-documents');

DROP POLICY IF EXISTS "homigo_worker_documents_storage_delete" ON storage.objects;
CREATE POLICY "homigo_worker_documents_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'worker-documents');
