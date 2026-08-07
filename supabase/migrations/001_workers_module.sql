-- DEPRECATED: Use 002_worker_services_service_id.sql if worker_services already exists.
-- This file incorrectly assumed worker_services.service_name — do NOT run on production.

-- ---------------------------------------------------------------------------
-- 1. worker_services (replaces deprecated workers.service_type)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (worker_id, service_name)
);

CREATE INDEX IF NOT EXISTS idx_worker_services_worker_id
  ON public.worker_services (worker_id);

CREATE INDEX IF NOT EXISTS idx_worker_services_service_name
  ON public.worker_services (service_name);

-- ---------------------------------------------------------------------------
-- 2. worker_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_documents_worker_id
  ON public.worker_documents (worker_id);

-- ---------------------------------------------------------------------------
-- 3. Migrate legacy service_type → worker_services (if column still exists)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workers'
      AND column_name = 'service_type'
  ) THEN
    INSERT INTO public.worker_services (worker_id, service_name)
    SELECT
      w.id,
      INITCAP(TRIM(w.service_type))
    FROM public.workers w
    WHERE w.service_type IS NOT NULL
      AND TRIM(w.service_type) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM public.worker_services ws
        WHERE ws.worker_id = w.id
          AND LOWER(ws.service_name) = LOWER(TRIM(w.service_type))
      );

    ALTER TABLE public.workers DROP COLUMN service_type;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Normalize worker status + restore soft-deleted test rows
-- ---------------------------------------------------------------------------
UPDATE public.workers
SET status = LOWER(TRIM(status))
WHERE status IS NOT NULL;

UPDATE public.workers
SET status = 'pending'
WHERE is_verified = false
  AND LOWER(COALESCE(status, '')) = 'active';

UPDATE public.workers
SET deleted_at = NULL
WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. RLS — open policies until admin auth is added
-- ---------------------------------------------------------------------------
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "homigo_workers_select" ON public.workers;
CREATE POLICY "homigo_workers_select"
  ON public.workers FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "homigo_workers_insert" ON public.workers;
CREATE POLICY "homigo_workers_insert"
  ON public.workers FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "homigo_workers_update" ON public.workers;
CREATE POLICY "homigo_workers_update"
  ON public.workers FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "homigo_worker_services_select" ON public.worker_services;
CREATE POLICY "homigo_worker_services_select"
  ON public.worker_services FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "homigo_worker_services_insert" ON public.worker_services;
CREATE POLICY "homigo_worker_services_insert"
  ON public.worker_services FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "homigo_worker_services_update" ON public.worker_services;
CREATE POLICY "homigo_worker_services_update"
  ON public.worker_services FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "homigo_worker_services_delete" ON public.worker_services;
CREATE POLICY "homigo_worker_services_delete"
  ON public.worker_services FOR DELETE
  USING (true);

DROP POLICY IF EXISTS "homigo_worker_documents_select" ON public.worker_documents;
CREATE POLICY "homigo_worker_documents_select"
  ON public.worker_documents FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "homigo_worker_documents_insert" ON public.worker_documents;
CREATE POLICY "homigo_worker_documents_insert"
  ON public.worker_documents FOR INSERT
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. Verify
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM public.workers WHERE deleted_at IS NULL) AS active_workers,
  (SELECT COUNT(*) FROM public.worker_services) AS service_rows,
  (SELECT COUNT(*) FROM public.worker_documents) AS document_rows;
