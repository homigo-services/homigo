-- Homigo Workers Module — compatible with EXISTING worker_services schema
-- worker_services columns: id, worker_id, service_id, experience_years, is_active, created_at, updated_at
--
-- SAFE: does NOT create, alter, or drop worker_services
-- SAFE: does NOT delete existing worker_services rows
-- Run in Supabase Dashboard → SQL Editor

-- ---------------------------------------------------------------------------
-- 1. worker_documents (only if missing)
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
-- 2. Migrate legacy workers.service_type → worker_services (service_id FK)
--    Only inserts rows that match an existing public.services record
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  service_name_column TEXT;
BEGIN
  SELECT c.column_name
  INTO service_name_column
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'services'
    AND c.column_name IN ('name', 'service_name', 'title')
  ORDER BY CASE c.column_name
    WHEN 'name' THEN 1
    WHEN 'service_name' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF service_name_column IS NULL THEN
    RAISE NOTICE 'Skipping service_type migration: public.services name column not found';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workers'
      AND column_name = 'service_type'
  ) THEN
    RAISE NOTICE 'Skipping service_type migration: workers.service_type column not found';
    RETURN;
  END IF;

  EXECUTE format(
    $sql$
    INSERT INTO public.worker_services (
      worker_id,
      service_id,
      experience_years,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      w.id,
      s.id,
      0,
      true,
      now(),
      now()
    FROM public.workers w
    INNER JOIN public.services s
      ON lower(trim(s.%1$I)) = lower(trim(w.service_type))
    WHERE w.service_type IS NOT NULL
      AND trim(w.service_type) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM public.worker_services ws
        WHERE ws.worker_id = w.id
          AND ws.service_id = s.id
      )
    $sql$,
    service_name_column
  );

  ALTER TABLE public.workers DROP COLUMN service_type;
  RAISE NOTICE 'Migrated workers.service_type into worker_services via service_id';
END $$;

-- ---------------------------------------------------------------------------
-- 3. Normalize workers data (non-destructive)
-- ---------------------------------------------------------------------------
UPDATE public.workers
SET status = lower(trim(status))
WHERE status IS NOT NULL;

UPDATE public.workers
SET status = 'pending'
WHERE is_verified = false
  AND lower(coalesce(status, '')) = 'active';

UPDATE public.workers
SET deleted_at = NULL
WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. RLS for workers + worker_documents (worker_services left unchanged)
-- ---------------------------------------------------------------------------
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
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

DROP POLICY IF EXISTS "homigo_worker_documents_select" ON public.worker_documents;
CREATE POLICY "homigo_worker_documents_select"
  ON public.worker_documents FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "homigo_worker_documents_insert" ON public.worker_documents;
CREATE POLICY "homigo_worker_documents_insert"
  ON public.worker_documents FOR INSERT
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5. Verify (read-only)
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM public.workers WHERE deleted_at IS NULL) AS active_workers,
  (SELECT COUNT(*) FROM public.worker_services) AS worker_service_rows,
  (SELECT COUNT(*) FROM public.services) AS service_catalog_rows,
  (SELECT COUNT(*) FROM public.worker_documents) AS document_rows;
