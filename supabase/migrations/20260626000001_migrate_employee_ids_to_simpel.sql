-- Migrasi identitas pegawai SiCuti agar employees.id mengikuti ID SIMPEL.
--
-- Cara pakai:
-- 1. Deploy migration ini ke database SiCuti.
-- 2. Jalankan scripts/migrate-employee-ids-to-simpel.mjs --dry-run
-- 3. Jika hasil valid, jalankan scripts/migrate-employee-ids-to-simpel.mjs --apply
--
-- Fungsi ini sengaja menerima mapping dari luar karena database SiCuti tidak
-- otomatis punya akses langsung ke database SIMPEL.

CREATE TABLE IF NOT EXISTS public.employee_id_migration_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  mapping_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  notes text NULL
);

CREATE TABLE IF NOT EXISTS public.employee_id_migration_backup_employees (
  batch_id uuid NOT NULL REFERENCES public.employee_id_migration_batches(id) ON DELETE CASCADE,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  row_data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_id_migration_backup_leave_requests (
  batch_id uuid NOT NULL REFERENCES public.employee_id_migration_batches(id) ON DELETE CASCADE,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  row_data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_id_migration_backup_leave_balances (
  batch_id uuid NOT NULL REFERENCES public.employee_id_migration_batches(id) ON DELETE CASCADE,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  row_data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_id_migration_backup_leave_deferrals (
  batch_id uuid NOT NULL REFERENCES public.employee_id_migration_batches(id) ON DELETE CASCADE,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  row_data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_id_migration_backup_leave_proposal_items (
  batch_id uuid NOT NULL REFERENCES public.employee_id_migration_batches(id) ON DELETE CASCADE,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  row_data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_id_migration_backup_profiles (
  batch_id uuid NOT NULL REFERENCES public.employee_id_migration_batches(id) ON DELETE CASCADE,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  row_data jsonb NOT NULL
);

CREATE OR REPLACE FUNCTION public.migrate_employee_ids_to_simpel(
  p_mappings jsonb,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  batch_id uuid,
  mapping_count integer,
  changed_count integer,
  leave_requests_updated integer,
  leave_balances_updated integer,
  leave_deferrals_updated integer,
  leave_proposal_items_updated integer,
  profiles_updated integer,
  employees_merged integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_mapping_count integer := 0;
  v_changed_count integer := 0;
  v_leave_requests_updated integer := 0;
  v_leave_balances_updated integer := 0;
  v_leave_deferrals_updated integer := 0;
  v_leave_proposal_items_updated integer := 0;
  v_profiles_updated integer := 0;
  v_employees_merged integer := 0;
BEGIN
  CREATE TEMP TABLE _employee_id_map (
    local_id uuid PRIMARY KEY,
    simpel_id uuid NOT NULL,
    nip text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _employee_id_map (local_id, simpel_id, nip)
  SELECT
    (item ->> 'local_id')::uuid,
    (item ->> 'simpel_id')::uuid,
    btrim(item ->> 'nip')
  FROM jsonb_array_elements(p_mappings) AS item
  WHERE NULLIF(item ->> 'local_id', '') IS NOT NULL
    AND NULLIF(item ->> 'simpel_id', '') IS NOT NULL
    AND NULLIF(btrim(item ->> 'nip'), '') IS NOT NULL;

  SELECT count(*) INTO v_mapping_count FROM _employee_id_map;

  IF v_mapping_count = 0 THEN
    RAISE EXCEPTION 'Mapping kosong. Tidak ada data yang dimigrasikan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _employee_id_map m
    LEFT JOIN public.employees e ON e.id = m.local_id
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Mapping tidak valid: ada local_id yang tidak ditemukan di employees.';
  END IF;

  DELETE FROM _employee_id_map WHERE local_id = simpel_id;
  SELECT count(*) INTO v_changed_count FROM _employee_id_map;

  CREATE TEMP TABLE _employee_source ON COMMIT DROP AS
  SELECT e.*
  FROM public.employees e
  JOIN _employee_id_map m ON m.local_id = e.id;

  INSERT INTO public.employee_id_migration_batches (
    id,
    mapping_count,
    changed_count,
    notes
  )
  VALUES (
    v_batch_id,
    v_mapping_count,
    v_changed_count,
    p_notes
  );

  IF v_changed_count = 0 THEN
    RETURN QUERY SELECT
      v_batch_id,
      v_mapping_count,
      v_changed_count,
      0,
      0,
      0,
      0,
      0,
      0;
    RETURN;
  END IF;

  INSERT INTO public.employee_id_migration_backup_employees (batch_id, row_data)
  SELECT v_batch_id, to_jsonb(e)
  FROM public.employees e
  WHERE e.id IN (
    SELECT local_id FROM _employee_id_map
    UNION
    SELECT simpel_id FROM _employee_id_map
  );

  INSERT INTO public.employee_id_migration_backup_leave_requests (batch_id, row_data)
  SELECT v_batch_id, to_jsonb(lr)
  FROM public.leave_requests lr
  JOIN _employee_id_map m ON m.local_id = lr.employee_id;

  INSERT INTO public.employee_id_migration_backup_leave_balances (batch_id, row_data)
  SELECT v_batch_id, to_jsonb(lb)
  FROM public.leave_balances lb
  JOIN _employee_id_map m ON m.local_id = lb.employee_id;

  INSERT INTO public.employee_id_migration_backup_leave_deferrals (batch_id, row_data)
  SELECT v_batch_id, to_jsonb(ld)
  FROM public.leave_deferrals ld
  JOIN _employee_id_map m ON m.local_id = ld.employee_id;

  INSERT INTO public.employee_id_migration_backup_leave_proposal_items (batch_id, row_data)
  SELECT v_batch_id, to_jsonb(lpi)
  FROM public.leave_proposal_items lpi
  JOIN _employee_id_map m ON m.local_id = lpi.employee_id;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    INSERT INTO public.employee_id_migration_backup_profiles (batch_id, row_data)
    SELECT v_batch_id, to_jsonb(p)
    FROM public.profiles p
    JOIN _employee_id_map m ON m.local_id = p.employee_id;
  END IF;

  -- Pastikan row target SIMPEL ada sebelum child FK diarahkan ke sana.
  -- NIP sengaja NULL dulu untuk menghindari bentrok unique(nip) dengan row lokal lama.
  INSERT INTO public.employees (
    id,
    nip,
    name,
    old_position,
    department,
    join_date,
    position_type,
    position_name,
    asn_status,
    rank_group,
    created_at,
    updated_at
  )
  SELECT DISTINCT ON (m.simpel_id)
    m.simpel_id,
    NULL,
    e.name,
    e.old_position,
    e.department,
    e.join_date,
    e.position_type,
    e.position_name,
    e.asn_status,
    e.rank_group,
    e.created_at,
    now()
  FROM _employee_id_map m
  JOIN _employee_source e ON e.id = m.local_id
  ORDER BY m.simpel_id, (e.nip IS NOT NULL) DESC, e.updated_at DESC NULLS LAST, e.created_at DESC NULLS LAST
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, public.employees.name),
    old_position = COALESCE(EXCLUDED.old_position, public.employees.old_position),
    department = COALESCE(EXCLUDED.department, public.employees.department),
    join_date = COALESCE(EXCLUDED.join_date, public.employees.join_date),
    position_type = COALESCE(EXCLUDED.position_type, public.employees.position_type),
    position_name = COALESCE(EXCLUDED.position_name, public.employees.position_name),
    asn_status = COALESCE(EXCLUDED.asn_status, public.employees.asn_status),
    rank_group = COALESCE(EXCLUDED.rank_group, public.employees.rank_group),
    updated_at = now();

  UPDATE public.leave_requests lr
  SET employee_id = m.simpel_id
  FROM _employee_id_map m
  WHERE lr.employee_id = m.local_id;
  GET DIAGNOSTICS v_leave_requests_updated = ROW_COUNT;

  CREATE TEMP TABLE _leave_balance_scope ON COMMIT DROP AS
  SELECT lb.*, m.simpel_id AS target_employee_id
  FROM public.leave_balances lb
  JOIN _employee_id_map m ON m.local_id = lb.employee_id
  UNION ALL
  SELECT lb.*, m.simpel_id AS target_employee_id
  FROM public.leave_balances lb
  JOIN (SELECT DISTINCT simpel_id FROM _employee_id_map) m ON m.simpel_id = lb.employee_id;

  CREATE TEMP TABLE _leave_balance_ranked ON COMMIT DROP AS
  SELECT
    lb.*,
    row_number() OVER (
      PARTITION BY lb.target_employee_id, lb.leave_type_id, lb.year
      ORDER BY (lb.employee_id = lb.target_employee_id) DESC, lb.updated_at DESC NULLS LAST, lb.created_at DESC NULLS LAST
    ) AS rn
  FROM _leave_balance_scope lb;

  CREATE TEMP TABLE _leave_balance_merged ON COMMIT DROP AS
  SELECT
    (array_agg(id ORDER BY rn))[1] AS keep_id,
    target_employee_id AS employee_id,
    leave_type_id,
    year,
    max(total_days) AS total_days,
    sum(COALESCE(used_days, 0)) AS used_days,
    sum(COALESCE(deferred_days, 0)) AS deferred_days,
    min(created_at) AS created_at,
    now() AS updated_at,
    array_agg(id) AS balance_ids
  FROM _leave_balance_ranked
  GROUP BY target_employee_id, leave_type_id, year;

  UPDATE public.leave_balances lb
  SET
    employee_id = merged.employee_id,
    total_days = merged.total_days,
    used_days = merged.used_days,
    deferred_days = merged.deferred_days,
    created_at = COALESCE(merged.created_at, lb.created_at),
    updated_at = merged.updated_at
  FROM _leave_balance_merged merged
  WHERE lb.id = merged.keep_id;
  GET DIAGNOSTICS v_leave_balances_updated = ROW_COUNT;

  DELETE FROM public.leave_balances lb
  USING _leave_balance_merged merged
  WHERE lb.id = ANY(merged.balance_ids)
    AND lb.id <> merged.keep_id;

  UPDATE public.leave_deferrals ld
  SET employee_id = m.simpel_id
  FROM _employee_id_map m
  WHERE ld.employee_id = m.local_id;
  GET DIAGNOSTICS v_leave_deferrals_updated = ROW_COUNT;

  UPDATE public.leave_proposal_items lpi
  SET employee_id = m.simpel_id
  FROM _employee_id_map m
  WHERE lpi.employee_id = m.local_id;
  GET DIAGNOSTICS v_leave_proposal_items_updated = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    UPDATE public.profiles p
    SET employee_id = m.simpel_id
    FROM _employee_id_map m
    WHERE p.employee_id = m.local_id;
    GET DIAGNOSTICS v_profiles_updated = ROW_COUNT;
  END IF;

  DELETE FROM public.employees e
  USING _employee_id_map m
  WHERE e.id = m.local_id
    AND e.id <> m.simpel_id;
  GET DIAGNOSTICS v_employees_merged = ROW_COUNT;

  UPDATE public.employees e
  SET
    nip = final.nip,
    name = COALESCE(final.name, e.name),
    old_position = COALESCE(final.old_position, e.old_position),
    department = COALESCE(final.department, e.department),
    join_date = COALESCE(final.join_date, e.join_date),
    position_type = COALESCE(final.position_type, e.position_type),
    position_name = COALESCE(final.position_name, e.position_name),
    asn_status = COALESCE(final.asn_status, e.asn_status),
    rank_group = COALESCE(final.rank_group, e.rank_group),
    updated_at = now()
  FROM (
    SELECT DISTINCT ON (m.simpel_id)
      m.simpel_id,
      m.nip,
      s.name,
      s.old_position,
      s.department,
      s.join_date,
      s.position_type,
      s.position_name,
      s.asn_status,
      s.rank_group
    FROM _employee_id_map m
    JOIN _employee_source s ON s.id = m.local_id
    ORDER BY m.simpel_id, (s.nip IS NOT NULL) DESC, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
  ) final
  WHERE e.id = final.simpel_id;

  RETURN QUERY SELECT
    v_batch_id,
    v_mapping_count,
    v_changed_count,
    v_leave_requests_updated,
    v_leave_balances_updated,
    v_leave_deferrals_updated,
    v_leave_proposal_items_updated,
    v_profiles_updated,
    v_employees_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrate_employee_ids_to_simpel(jsonb, text) TO service_role;
