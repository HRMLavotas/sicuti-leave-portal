-- Migration: Add new status for proposals awaiting letter generation
-- Status flow: pending → forwarded → approved → awaiting_letter → letter_issued → completed

-- 1. Migrate existing 'processed' status to 'letter_issued' BEFORE dropping constraint
UPDATE leave_proposals 
SET status = 'letter_issued'
WHERE status = 'processed';

-- 2. Drop existing constraint
ALTER TABLE leave_proposals 
DROP CONSTRAINT IF EXISTS leave_proposals_status_check;

-- 3. Add new constraint with awaiting_letter and letter_issued status
-- Include 'processed' temporarily for backward compatibility
ALTER TABLE leave_proposals
ADD CONSTRAINT leave_proposals_status_check
CHECK (status IN ('pending', 'forwarded', 'approved', 'rejected', 'awaiting_letter', 'letter_issued', 'completed', 'processed'));

-- 4. Update comment untuk menjelaskan status baru
COMMENT ON COLUMN leave_proposals.status IS 'Status flow:
- pending: Menunggu review admin unit
- forwarded: Diteruskan ke admin pusat
- approved: Disetujui admin unit (untuk unit scope)
- rejected: Ditolak
- awaiting_letter: Disetujui & Menunggu Surat Keterangan
- letter_issued: Surat Keterangan Sudah Diterbitkan  
- completed: Selesai & diserahkan
- processed: (deprecated, use letter_issued)';

-- 4. Update comment untuk menjelaskan status baru
COMMENT ON COLUMN leave_proposals.status IS 'Status flow:
- pending: Menunggu review admin unit
- forwarded: Diteruskan ke admin pusat
- approved: Disetujui admin unit (untuk unit scope)
- rejected: Ditolak
- awaiting_letter: Disetujui & Menunggu Surat Keterangan
- letter_issued: Surat Keterangan Sudah Diterbitkan  
- completed: Selesai & diserahkan
- processed: (deprecated, use letter_issued)';

-- 5. Create index for new status
CREATE INDEX IF NOT EXISTS idx_leave_proposals_awaiting_letter 
ON leave_proposals(status) 
WHERE status = 'awaiting_letter';

CREATE INDEX IF NOT EXISTS idx_leave_proposals_letter_issued 
ON leave_proposals(status) 
WHERE status = 'letter_issued';

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE 'Migration completed: New statuses added successfully';
  RAISE NOTICE 'Status flow: pending → forwarded → approved → awaiting_letter → letter_issued → completed';
END $$;
