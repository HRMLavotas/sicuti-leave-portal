-- Migration: Drop users and profiles tables from SiCuti
-- Auth sepenuhnya dari SIMPEL, tidak ada duplikasi user data

-- Step 1: Update FK yang reference users.id → ganti ke langsung pakai UUID dari SIMPEL auth
-- Tabel yang perlu diupdate:
--   • notifications.user_id
--   • audit_logs.user_id
--   • notification_preferences.user_id
--   • system_announcements.created_by
--   • leave_proposals.proposed_by, completed_by

-- Catatan: FK ini akan reference ke UUID auth SIMPEL yang disimpan di localStorage
-- Tidak ada tabel lokal yang menyimpan user data lagi

-- Step 2: Drop foreign key constraints
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_user_id_fkey;
ALTER TABLE system_announcements DROP CONSTRAINT IF EXISTS system_announcements_created_by_fkey;
ALTER TABLE leave_proposals DROP CONSTRAINT IF EXISTS leave_proposals_proposed_by_fkey;
ALTER TABLE leave_proposals DROP CONSTRAINT IF EXISTS leave_proposals_completed_by_fkey;

-- Step 3: Drop views yang depend on users
DROP VIEW IF EXISTS notification_summary CASCADE;
DROP VIEW IF EXISTS recent_security_events CASCADE;

-- Step 4: Drop tables
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Step 5: Add comment untuk dokumentasi
COMMENT ON TABLE notifications IS 'user_id references auth.users.id from SIMPEL Supabase (no local FK)';
COMMENT ON TABLE audit_logs IS 'user_id references auth.users.id from SIMPEL Supabase (no local FK)';
COMMENT ON TABLE leave_proposals IS 'proposed_by and completed_by reference auth.users.id from SIMPEL (no local FK)';

-- Note: employees table TETAP ADA untuk FK data cuti historis
-- Tapi tidak akan di-maintain manual lagi — hanya untuk bridge ke data lama