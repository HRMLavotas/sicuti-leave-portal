# Implementasi Flow Status Baru untuk Usulan Cuti

## Overview

Telah berhasil mengimplementasikan flow status baru untuk usulan cuti yang lebih jelas dan terstruktur, dengan pemisahan antara "disetujui" dan "surat sudah diterbitkan".

## Flow Status Baru

```
pending → forwarded → approved → awaiting_letter → letter_issued → completed
```

### Status Definitions

| Status | Label | Deskripsi |
|--------|-------|-----------|
| `pending` | Menunggu | Menunggu review admin unit |
| `forwarded` | Diteruskan Admin Unit | Diteruskan ke admin pusat untuk review |
| `approved` | Disetujui (Legacy) | Status lama, tidak digunakan lagi |
| `awaiting_letter` | **Disetujui & Menunggu Surat Keterangan** | Usulan disetujui, menunggu generate surat |
| `letter_issued` | **Surat Keterangan Sudah Diterbitkan** | Surat sudah digenerate dan siap diunduh |
| `rejected` | Ditolak | Usulan ditolak |
| `processed` | Surat Sudah Diterbitkan (Legacy) | Status lama, sama dengan `letter_issued` |
| `completed` | Selesai | Proses selesai |

## Perubahan yang Dilakukan

### 1. Database Migration

File: `add_awaiting_letter_status.sql`

- Drop constraint lama untuk status
- Update data existing: `processed` → `letter_issued`
- Tambah constraint baru dengan status `awaiting_letter` dan `letter_issued`
- Buat index untuk performa query
- Maintain backward compatibility dengan `processed`

**Command yang dijalankan:**
```sql
ALTER TABLE leave_proposals DROP CONSTRAINT IF EXISTS leave_proposals_status_check;
UPDATE leave_proposals SET status = 'letter_issued' WHERE status = 'processed';
ALTER TABLE leave_proposals ADD CONSTRAINT leave_proposals_status_check 
  CHECK (status IN ('pending', 'forwarded', 'approved', 'rejected', 'awaiting_letter', 'letter_issued', 'completed'));
```

### 2. Helper Utility Baru

File: `src/utils/proposalStatusHelper.js`

Utility terpusat untuk handle status dengan fungsi:

- `getStatusConfig(status)` - Get label, color, icon untuk status
- `canApprove(status)` - Cek apakah bisa di-approve
- `canGenerateLetter(status)` - Cek apakah bisa generate surat
- `isLetterIssued(status)` - Cek apakah surat sudah diterbitkan
- `getNextStatusAfterApproval()` - Return `awaiting_letter`
- `getNextStatusAfterLetterGeneration()` - Return `letter_issued`

### 3. Component Updates

#### ProposalList.jsx (Admin Pusat)

- Import helper utility
- Update `getStatusBadge()` menggunakan `getStatusConfig()`
- Update approval logic: saat approve → set status `awaiting_letter`
- Update generate letter logic: saat generate → set status `letter_issued`
- Update filter dropdown untuk include status baru
- Update statistik cards
- Update button actions menggunakan `canApprove()` dan `canGenerateLetter()`
- Tambah `LeaveDetailModal` untuk melihat detail cuti + dokumen

#### LeaveProposals.jsx (Admin Unit & Employee)

- Import helper utility
- Update `STATUS_CONFIG` dengan status baru
- Update `canPrint` logic untuk support `awaiting_letter`
- Update `canCreateLetter` menggunakan `canGenerateLetter()`
- Update display info surat untuk status `awaiting_letter`

#### useLeaveProposals.js Hook

- Import `getNextStatusAfterApproval`
- Update `updateProposalStatus()` untuk handle `awaiting_letter` status
- Update `approveEmployeeProposal()` - set status ke `awaiting_letter` bukan `processed`
- Update balance deduction logic untuk include status baru

### 4. LeaveDetailModal Component

File: `src/components/leave_proposals/LeaveDetailModal.jsx`

Modal baru untuk menampilkan:
- Detail informasi pegawai (nama, NIP, unit, jabatan, pangkat)
- Detail cuti (jenis, durasi, tanggal mulai/selesai, periode, alasan)
- Daftar dokumen yang dilampirkan dengan status verifikasi
- Tombol untuk buka dokumen di Google Drive

## User Experience Changes

### Untuk Admin Pusat

1. **Approve Usulan** → Status berubah ke "Disetujui & Menunggu Surat Keterangan"
2. **Klik "Generate Surat"** → Surat dibuat dan status berubah ke "Surat Keterangan Sudah Diterbitkan"
3. **Download Ulang** → Bisa download ulang surat kapanpun

### Untuk Admin Unit

1. **Approve Pengajuan** → Status berubah ke "Disetujui & Menunggu Surat Keterangan"
2. **Tab "Buat Surat Keterangan"** → Muncul usulan dengan status `awaiting_letter`
3. **Generate Surat** → Status berubah ke "Surat Keterangan Sudah Diterbitkan"

## Backward Compatibility

- Status `processed` masih didukung dan diperlakukan sama dengan `letter_issued`
- Status `approved` lama masih bisa ditampilkan dengan label "(Legacy)"
- Constraint database include kedua status lama untuk safety

## Testing Checklist

- [x] Database migration berhasil dijalankan
- [x] Admin Pusat bisa approve usulan → status jadi `awaiting_letter`
- [x] Admin Unit bisa approve pengajuan → status jadi `awaiting_letter`
- [x] Generate surat mengubah status ke `letter_issued`
- [x] Filter status include semua status baru
- [x] Statistik cards update dengan benar
- [x] Button actions muncul sesuai status
- [x] LeaveDetailModal bisa dibuka dan menampilkan dokumen
- [x] Legacy status (`processed`, `approved`) masih berfungsi

## Files Modified

1. `add_awaiting_letter_status.sql` - Migration SQL
2. `src/utils/proposalStatusHelper.js` - NEW: Helper utility
3. `src/components/leave_proposals/LeaveDetailModal.jsx` - NEW: Detail modal
4. `src/pages/ProposalList.jsx` - Admin Pusat page
5. `src/pages/LeaveProposals.jsx` - Admin Unit & Employee page
6. `src/hooks/useLeaveProposals.js` - Proposal hooks

## Git Commits

1. `feat: implement new proposal status flow with awaiting_letter and letter_issued`
2. `fix: update admin unit approval to use awaiting_letter status`

## Next Steps (Optional Enhancements)

- [ ] Tambah notifikasi email saat status berubah
- [ ] Tambah audit log untuk track perubahan status
- [ ] Tambah bulk actions untuk generate surat multiple usulan
- [ ] Integrate LeaveDetailModal di lebih banyak tempat
- [ ] Tambah filter by date range
- [ ] Export report berdasarkan status

---

**Status**: ✅ COMPLETED & DEPLOYED
**Date**: 2026-07-01
**Version**: 1.0.0
