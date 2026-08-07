-- Homigo Workers Module — consolidate documents onto workers table
-- Keeps: public.workers, public.worker_services
-- Removes: public.worker_documents
--
-- SAFE: does NOT alter worker_services or services
-- Run in Supabase Dashboard → SQL Editor

-- ---------------------------------------------------------------------------
-- 1. Add document + experience columns to workers (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS experience_years INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aadhaar_url TEXT,
  ADD COLUMN IF NOT EXISTS certificate_url TEXT,
  ADD COLUMN IF NOT EXISTS address_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS police_verification_url TEXT;

-- ---------------------------------------------------------------------------
-- 2. Migrate worker_documents → workers (only if table exists)
--    Uses the newest row per worker + document type (created_at DESC).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.worker_documents') IS NULL THEN
    RAISE NOTICE 'Skipping document migration: public.worker_documents does not exist';
    RETURN;
  END IF;

  -- Aadhaar / Aadhar
  UPDATE public.workers w
  SET aadhaar_url = d.file_url
  FROM (
    SELECT DISTINCT ON (worker_id)
      worker_id,
      file_url
    FROM public.worker_documents
    WHERE lower(trim(document_type)) IN ('aadhaar', 'aadhar', 'aadhaar_url', 'aadhar_url')
      AND file_url IS NOT NULL
      AND trim(file_url) <> ''
    ORDER BY worker_id, created_at DESC NULLS LAST
  ) d
  WHERE w.id = d.worker_id
    AND w.aadhaar_url IS NULL;

  -- Certificate
  UPDATE public.workers w
  SET certificate_url = d.file_url
  FROM (
    SELECT DISTINCT ON (worker_id)
      worker_id,
      file_url
    FROM public.worker_documents
    WHERE lower(trim(document_type)) IN ('certificate', 'cert', 'certificate_url')
      AND file_url IS NOT NULL
      AND trim(file_url) <> ''
    ORDER BY worker_id, created_at DESC NULLS LAST
  ) d
  WHERE w.id = d.worker_id
    AND w.certificate_url IS NULL;

  -- Address proof
  UPDATE public.workers w
  SET address_proof_url = d.file_url
  FROM (
    SELECT DISTINCT ON (worker_id)
      worker_id,
      file_url
    FROM public.worker_documents
    WHERE lower(trim(document_type)) IN (
      'address_proof',
      'address proof',
      'address_proof_url',
      'addressproof'
    )
      AND file_url IS NOT NULL
      AND trim(file_url) <> ''
    ORDER BY worker_id, created_at DESC NULLS LAST
  ) d
  WHERE w.id = d.worker_id
    AND w.address_proof_url IS NULL;

  -- Police verification
  UPDATE public.workers w
  SET police_verification_url = d.file_url
  FROM (
    SELECT DISTINCT ON (worker_id)
      worker_id,
      file_url
    FROM public.worker_documents
    WHERE lower(trim(document_type)) IN (
      'police_verification',
      'police verification',
      'police_verification_url',
      'police',
      'police_clearance'
    )
      AND file_url IS NOT NULL
      AND trim(file_url) <> ''
    ORDER BY worker_id, created_at DESC NULLS LAST
  ) d
  WHERE w.id = d.worker_id
    AND w.police_verification_url IS NULL;

  -- Photo → workers.photo_url (column already exists on workers)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workers'
      AND column_name = 'photo_url'
  ) THEN
    UPDATE public.workers w
    SET photo_url = d.file_url
    FROM (
      SELECT DISTINCT ON (worker_id)
        worker_id,
        file_url
      FROM public.worker_documents
      WHERE lower(trim(document_type)) IN ('photo', 'photo_url', 'profile_photo')
        AND file_url IS NOT NULL
        AND trim(file_url) <> ''
      ORDER BY worker_id, created_at DESC NULLS LAST
    ) d
    WHERE w.id = d.worker_id
      AND (w.photo_url IS NULL OR trim(w.photo_url) = '');
  END IF;

  RAISE NOTICE 'Migrated worker_documents URLs into public.workers columns';
END $$;

-- ---------------------------------------------------------------------------
-- 3. Drop worker_documents (policies → index → table)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.worker_documents') IS NULL THEN
    RAISE NOTICE 'public.worker_documents already absent';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "homigo_worker_documents_select" ON public.worker_documents;
  DROP POLICY IF EXISTS "homigo_worker_documents_insert" ON public.worker_documents;
  DROP POLICY IF EXISTS "homigo_worker_documents_update" ON public.worker_documents;
  DROP POLICY IF EXISTS "homigo_worker_documents_delete" ON public.worker_documents;

  DROP INDEX IF EXISTS public.idx_worker_documents_worker_id;

  DROP TABLE public.worker_documents;

  RAISE NOTICE 'Dropped public.worker_documents';
END $$;

-- ---------------------------------------------------------------------------
-- 4. Post-migration verify (read-only)
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM public.workers WHERE deleted_at IS NULL) AS active_workers,
  (SELECT COUNT(*) FROM public.worker_services) AS worker_service_rows,
  to_regclass('public.worker_documents') IS NULL AS worker_documents_dropped,
  (SELECT COUNT(*) FROM public.workers WHERE aadhaar_url IS NOT NULL) AS workers_with_aadhaar,
  (SELECT COUNT(*) FROM public.workers WHERE certificate_url IS NOT NULL) AS workers_with_certificate,
  (SELECT COUNT(*) FROM public.workers WHERE address_proof_url IS NOT NULL) AS workers_with_address_proof,
  (SELECT COUNT(*) FROM public.workers WHERE police_verification_url IS NOT NULL) AS workers_with_police_verification;
