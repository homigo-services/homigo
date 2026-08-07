-- Allow admin soft-delete and status updates under RLS (WITH CHECK required on UPDATE)
DROP POLICY IF EXISTS "homigo_workers_update" ON public.workers;
CREATE POLICY "homigo_workers_update"
  ON public.workers FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Ensure worker_services mutations work for admin API routes using anon key
DROP POLICY IF EXISTS "homigo_worker_services_delete" ON public.worker_services;
CREATE POLICY "homigo_worker_services_delete"
  ON public.worker_services FOR DELETE
  USING (true);

DROP POLICY IF EXISTS "homigo_worker_services_insert" ON public.worker_services;
CREATE POLICY "homigo_worker_services_insert"
  ON public.worker_services FOR INSERT
  WITH CHECK (true);
