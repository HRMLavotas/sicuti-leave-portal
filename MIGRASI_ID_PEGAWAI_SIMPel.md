# Migrasi ID Pegawai SiCuti ke ID SIMPEL

Tujuan migrasi ini adalah menjadikan `employees.id` di SiCuti sama dengan `employees.id` di SIMPEL, sehingga `leave_requests`, `leave_balances`, `leave_deferrals`, dan `leave_proposal_items` semuanya menginduk ke ID SIMPEL.

## Urutan Aman

1. Deploy SQL migration:
   `supabase/migrations/20260626000001_migrate_employee_ids_to_simpel.sql`

2. Jalankan audit:
   ```bash
   npm run migrate:employee-ids:dry-run
   ```

3. Buka folder audit di:
   `tmp/employee-id-migration/<timestamp>/`

4. Pastikan `blocking-issues.json` kosong.

5. Jika sudah kosong, baru jalankan:
   ```bash
   npm run migrate:employee-ids:apply
   ```

## Hasil Migrasi Final

Migrasi final sudah dijalankan pada 26 Juni 2026 dengan batch:

`1b707d7d-9b76-4223-a5b9-09770a10c216`

Ringkasan hasil apply:

- Mapping pegawai diproses: 3441
- ID pegawai yang berubah ke ID SIMPEL: 3441
- `leave_requests` diperbarui: 1489 record
- `leave_balances` diperbarui: 32545 record
- `leave_deferrals` diperbarui: 203 record
- `leave_proposal_items` diperbarui: 0 record
- Pegawai yang di-skip karena tidak ada di SIMPEL: 61 saat apply

Dry-run pasca-migrasi menunjukkan:

- Pegawai lokal SiCuti: 3441
- Pegawai SIMPEL: 3371
- Mapping valid berdasarkan NIP: 3370
- Manual override: 72
- ID yang masih perlu berubah: 0
- Isu yang di-skip karena tidak ada di SIMPEL: 60

Data yang di-skip tidak dibuatkan pegawai baru di SIMPEL sesuai keputusan operasional.

## Arti Isu Pemblokir

- `unmapped_referenced_employee`: pegawai lokal punya data cuti/saldo, tetapi NIP-nya tidak ditemukan di SIMPEL. Data ini tidak boleh dimigrasikan otomatis karena tidak ada ID SIMPEL tujuan yang valid.
- `target_id_conflict`: ID SIMPEL tujuan sudah ada sebagai row pegawai lokal lain dengan NIP berbeda. Ini harus dibereskan manual agar data tidak tertukar.

## Backup

Saat `--apply` dijalankan, fungsi SQL membuat backup row terdampak ke tabel:

- `employee_id_migration_backup_employees`
- `employee_id_migration_backup_leave_requests`
- `employee_id_migration_backup_leave_balances`
- `employee_id_migration_backup_leave_deferrals`
- `employee_id_migration_backup_leave_proposal_items`
- `employee_id_migration_backup_profiles`

Setiap apply juga tercatat di `employee_id_migration_batches`.

## Catatan Supabase CLI

File `supabase/.temp/cli-latest` adalah cache lokal Supabase CLI yang hanya berisi versi CLI terbaru yang terdeteksi di mesin saat query dijalankan.

Pada audit 26 Juni 2026, nilai lokal file tersebut sempat menjadi:

`v2.108.0`

File ini tidak perlu dijadikan perubahan commit/push. Jika berubah lagi di device lain, anggap sebagai cache lokal CLI, bukan perubahan implementasi aplikasi. Informasi pentingnya dicatat di dokumen ini agar tetap terlihat dari device lain.

## Verifikasi Pasca-migrasi

Pemeriksaan terakhir:

- Build produksi `npm run build`: sukses
- Lint `npm run lint:check`: 0 error, 6 warning Fast Refresh di komponen UI scaffold
- Orphan `leave_requests`: 0
- Orphan `leave_balances`: 0
- Orphan `leave_deferrals`: 0
- Orphan `leave_proposal_items`: 0
- Duplikat saldo cuti: 0
- `leave_requests` yang join ke pegawai: 1518 dari 1518
- `leave_balances` yang join ke pegawai: 33206 dari 33206
- `leave_deferrals` yang join ke pegawai: 206 dari 206
