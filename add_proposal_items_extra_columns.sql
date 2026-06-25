-- Migration: Tambah kolom leave_period dan application_form_date ke leave_proposal_items
-- Jalankan di Supabase SQL Editor

ALTER TABLE leave_proposal_items
ADD COLUMN IF NOT EXISTS leave_period INTEGER;

ALTER TABLE leave_proposal_items
ADD COLUMN IF NOT EXISTS application_form_date DATE;

COMMENT ON COLUMN leave_proposal_items.leave_period IS
  'Periode tahun cuti — sama dengan leave_period di leave_requests';

COMMENT ON COLUMN leave_proposal_items.application_form_date IS
  'Tanggal pegawai mengisi formulir pengajuan cuti';

-- Backfill: isi leave_period dari leave_quota_year jika ada
UPDATE leave_proposal_items
SET leave_period = leave_quota_year
WHERE leave_period IS NULL AND leave_quota_year IS NOT NULL;

-- Verifikasi
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'leave_proposal_items'
  AND table_schema = 'public'
  AND column_name IN ('leave_period', 'application_form_date', 'leave_quota_year')
ORDER BY column_name;
