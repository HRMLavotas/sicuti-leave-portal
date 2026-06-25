-- Migration: Tambah status 'forwarded' dan kolom tracking untuk leave_proposals
-- Jalankan di Supabase SQL Editor

-- 1. Update CHECK constraint untuk tambah status 'forwarded'
ALTER TABLE leave_proposals
DROP CONSTRAINT IF EXISTS leave_proposals_status_check;

ALTER TABLE leave_proposals
ADD CONSTRAINT leave_proposals_status_check
CHECK (status IN ('pending', 'approved', 'rejected', 'processed', 'completed', 'forwarded'));

-- 2. Tambah kolom forwarding tracking
ALTER TABLE leave_proposals
ADD COLUMN IF NOT EXISTS forwarded_by UUID;

ALTER TABLE leave_proposals
ADD COLUMN IF NOT EXISTS forwarded_date TIMESTAMPTZ;

-- 3. Update comment status
COMMENT ON COLUMN leave_proposals.status IS
  'pending: menunggu persetujuan, forwarded: diteruskan admin_unit ke admin_pusat, approved: disetujui, rejected: ditolak, processed: surat sudah di-generate, completed: selesai';

-- 4. Index untuk query forwarded
CREATE INDEX IF NOT EXISTS idx_leave_proposals_forwarded_by ON leave_proposals(forwarded_by);
CREATE INDEX IF NOT EXISTS idx_leave_proposals_status ON leave_proposals(status);

-- 5. Verifikasi
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'leave_proposals'
  AND table_schema = 'public'
  AND column_name IN ('status', 'forwarded_by', 'forwarded_date', 'approved_by', 'approved_date')
ORDER BY ordinal_position;
