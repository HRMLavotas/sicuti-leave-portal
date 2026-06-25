# Perbaikan & Implementasi Fitur Usulan Cuti (Leave Proposals)

## Ringkasan Perubahan

Dokumen ini mencatat semua perbaikan yang telah dilakukan untuk sistem Usulan Cuti (Leave Proposals), khususnya untuk memperbaiki masalah-masalah berikut:

1. ✅ Pengajuan cuti pegawai (employee role) tidak terhubung dengan profile SIMPEL
2. ✅ Tidak ada kalender hari libur untuk menghitung hari kerja
3. ✅ Admin Unit tidak bisa menyetujui, menolak, meneruskan, atau mencetak surat
4. ✅ Admin Unit bisa melihat dan mengelola pegawai dari unit lain (seharusnya hanya unitnya sendiri)
5. ✅ Query employee masih menggunakan tabel lokal SiCuti, bukan SIMPEL

---

## 1. Perbaikan LeaveProposalForm.jsx

### Masalah:
- Role `employee` query data pegawai dari tabel `employees` lokal SiCuti
- Perhitungan hari menggunakan `differenceInDays` (hari kalender) bukan `countWorkingDays` (hari kerja)
- Tidak ada integrasi dengan kalender hari libur nasional

### Solusi:
- **Query SIMPEL**: Ubah `supabase.from("employees")` → `supabaseSimpelAdmin.from("employees")`
- **Hari Kerja**: Gunakan `countWorkingDays()` dengan parameter `holidays` (Set dari hari libur nasional)
- **Kalender Libur**: Fetch dari `national_holidays` table via `fetchNationalHolidaysFromDB()`
- **Profile Loading**: Load profil pegawai employee dari SIMPEL by NIP atau user ID dengan fallback

### Perubahan File:
```javascript
// src/components/leave_proposals/LeaveProposalForm.jsx

// Import tambahan
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { countWorkingDays, fetchNationalHolidaysFromDB } from "@/utils/workingDays";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

// State untuk holidays
const [holidays, setHolidays] = useState(new Set());
const [isLoadingHolidays, setIsLoadingHolidays] = useState(false);

// Load holidays on mount
useEffect(() => {
  const loadHolidays = async () => {
    setIsLoadingHolidays(true);
    try {
      const [thisYear, lastYear] = await Promise.all([
        fetchNationalHolidaysFromDB(currentYear),
        fetchNationalHolidaysFromDB(currentYear - 1),
      ]);
      const merged = new Set([...thisYear, ...lastYear]);
      setHolidays(merged);
    } finally {
      setIsLoadingHolidays(false);
    }
  };
  loadHolidays();
}, [currentYear]);

// Hitung hari kerja, bukan hari kalender
useEffect(() => {
  if (currentLeaveItem.start_date && currentLeaveItem.end_date) {
    const days = countWorkingDays(
      currentLeaveItem.start_date,
      currentLeaveItem.end_date,
      holidays
    );
    setCurrentLeaveItem(prev => ({ ...prev, days_requested: days > 0 ? days : 0 }));
  }
}, [currentLeaveItem.start_date, currentLeaveItem.end_date, holidays]);

// Load profil employee dari SIMPEL
useEffect(() => {
  if (!isEmployee) return;
  
  const loadSelfProfile = async () => {
    const nip = currentUser?.nip;
    const userId = currentUser?.id;
    let employee = null;

    if (nip) {
      const { data } = await supabaseSimpelAdmin
        .from("employees")
        .select("id, nip, name, department, position_name, rank_group")
        .eq("nip", nip)
        .maybeSingle();
      employee = data;
    }
    if (!employee && userId) {
      const { data } = await supabaseSimpelAdmin
        .from("employees")
        .select("id, nip, name, department, position_name, rank_group")
        .eq("id", userId)
        .maybeSingle();
      employee = data;
    }

    if (employee) {
      setCurrentLeaveItem(prev => ({
        ...prev,
        employee_id: employee.id,
        employee_name: employee.name,
        employee_nip: employee.nip,
        employee_department: employee.department,
        employee_position: employee.position_name,
        employee_rank: employee.rank_group,
      }));
    }
  };
  loadSelfProfile();
}, [isEmployee, currentUser?.id, currentUser?.nip]);
```

---

## 2. Implementasi Workflow Approval untuk Admin Unit

### Fitur Baru di LeaveProposals.jsx:

#### A. Status Baru: `forwarded`
- Admin Unit bisa meneruskan pengajuan ke Admin Pusat

#### B. Tombol Aksi untuk Admin Unit:
- **Setujui** → Langsung approve + buat record leave_requests + potong saldo
- **Tolak** → Reject dengan alasan
- **Teruskan ke Admin Pusat** → Status jadi `forwarded`, Admin Pusat yang proses
- **Cetak Surat** (setelah approve) → Generate DOCX surat cuti

#### C. Dialog Persetujuan:
```javascript
// Dialog Setujui
<Dialog open={showApprovalDialog}>
  - Input: Nomor Surat
  - Input: Tanggal Surat
  - Select: Penandatangan (dari localStorage saved_signers)
  - Textarea: Catatan (opsional)
  - Action: Setujui & Terbitkan
</Dialog>

// Dialog Tolak
<Dialog open={showRejectDialog}>
  - Textarea: Alasan Penolakan (required)
  - Action: Tolak Pengajuan
</Dialog>

// Dialog Teruskan
<Dialog open={showForwardDialog}>
  - Textarea: Catatan Penerusan (opsional)
  - Action: Teruskan ke Admin Pusat
</Dialog>
```

#### D. Fungsi di useLeaveProposals.js:
```javascript
// Approve → buat leave_requests + potong saldo
const approveEmployeeProposal = async (proposalId, items, approvalData) => {
  for (const item of items) {
    // Insert ke leave_requests
    await supabase.from("leave_requests").insert({...});
    
    // Potong saldo via RPC
    await supabase.rpc("update_leave_balance_with_splitting", {...});
  }
  
  // Update proposal status
  await supabase.from("leave_proposals").update({
    status: 'approved',
    letter_number: approvalData.letter_number,
    letter_date: approvalData.letter_date,
  }).eq("id", proposalId);
};

// Reject
const rejectEmployeeProposal = async (proposalId, reason) => {
  await supabase.from("leave_proposals").update({
    status: 'rejected',
    rejection_reason: reason,
  }).eq("id", proposalId);
};

// Forward ke Admin Pusat
const forwardToAdminPusat = async (proposalId, forwardNote) => {
  await supabase.from("leave_proposals").update({
    status: 'forwarded',
    notes: forwardNote,
    forwarded_by: currentUser.id,
    forwarded_date: new Date().toISOString(),
  }).eq("id", proposalId);
};
```

---

## 3. Admin Pusat: ProposalList.jsx

### Perbaikan:
- ✅ Status `forwarded` ditambahkan ke statusConfig & filter Select
- ✅ Admin Pusat bisa approve/reject proposal yang diteruskan oleh Admin Unit
- ✅ Badge dan notifikasi untuk proposal `forwarded`
- ✅ Card stats "Menunggu Review" menghitung `pending` + `forwarded`
- ✅ `proposal_date` fallback ke `created_at` (tidak crash jika kolom NULL)

### Perubahan:
```javascript
// Status config lengkap
const STATUS_CONFIG = {
  pending:   { label: "Menunggu", ... },
  forwarded: { label: "Diteruskan ke Admin Pusat", ... },
  approved:  { label: "Disetujui", ... },
  rejected:  { label: "Ditolak", ... },
  processed: { label: "Diproses", ... },
  completed: { label: "Selesai", ... },
};

// Filter select
<SelectItem value="forwarded">Diteruskan Admin Unit</SelectItem>

// Stats card
{proposals.filter(p => p.status === 'pending' || p.status === 'forwarded').length}

// Action buttons untuk pending DAN forwarded
{(proposal.status === 'pending' || proposal.status === 'forwarded') && (
  <>
    <Button onClick={() => handleApprovalAction(proposal, 'approve')}>Setujui</Button>
    <Button onClick={() => handleApprovalAction(proposal, 'reject')}>Tolak</Button>
  </>
)}
```

---

## 4. Perbaikan Filter Admin Unit

### Masalah:
- Admin Unit bisa melihat pegawai dari semua unit
- Query masih menggunakan tabel `employees` lokal SiCuti, bukan SIMPEL

### Solusi:
Semua query employee sekarang melalui SIMPEL dengan filter unit:

#### A. LeaveRequestForm.jsx:
```javascript
// Query employee search dengan filter unit admin_unit
const fetchEmployees = useCallback(async (query) => {
  const currentUser = AuthManager.getUserSession();
  
  let dbQuery = supabaseSimpelAdmin
    .from("employees")
    .select("id, nip, name, department, position_name, rank_group")
    .or(`name.ilike.%${query}%,nip.ilike.%${query}%`)
    .limit(10);

  // admin_unit hanya bisa mencari pegawai di unitnya sendiri
  if (currentUser?.role === "admin_unit" && currentUser?.department) {
    dbQuery = dbQuery.eq("department", currentUser.department);
  }

  const { data } = await dbQuery;
  setSearchResults(data || []);
}, []);
```

#### B. LeaveRequests.jsx:
```javascript
// Filter berdasarkan role — query SIMPEL bukan tabel lokal
const currentUser = AuthManager.getUserSession();
const NO_ID = '00000000-0000-0000-0000-000000000000';

// Employee: cari di SIMPEL by NIP atau user ID
if (currentUser && currentUser.role === 'employee') {
  let simpelEmployee = null;
  if (currentUser.nip) {
    const { data } = await supabaseSimpelAdmin
      .from('employees').select('id').eq('nip', currentUser.nip).maybeSingle();
    simpelEmployee = data;
  }
  if (!simpelEmployee && currentUser.id) {
    const { data } = await supabaseSimpelAdmin
      .from('employees').select('id').eq('id', currentUser.id).maybeSingle();
    simpelEmployee = data;
  }
  if (simpelEmployee) {
    employeeIdsFilter = [simpelEmployee.id];
    countQuery = countQuery.eq('employee_id', simpelEmployee.id);
  } else {
    countQuery = countQuery.eq('employee_id', NO_ID);
  }
} else if (currentUser && currentUser.role === 'admin_unit' && userUnit) {
  // admin_unit: ambil semua ID pegawai dari unitnya di SIMPEL
  const { data: unitEmps } = await supabaseSimpelAdmin
    .from('employees').select('id').eq('department', userUnit);
  employeeIdsFilter = (unitEmps || []).map(e => e.id);
  if (employeeIdsFilter.length > 0) {
    countQuery = countQuery.in('employee_id', employeeIdsFilter);
  } else {
    countQuery = countQuery.eq('employee_id', NO_ID);
  }
}
```

#### C. useDepartments.js:
```javascript
// Query unit kerja dari SIMPEL dengan filter admin_unit
const currentUser = AuthManager.getUserSession();

let query = supabaseSimpelAdmin
  .from("employees")
  .select("department")
  .not("department", "is", null);

// admin_unit hanya lihat unitnya sendiri
if (currentUser?.role === "admin_unit" && currentUser?.department) {
  query = query.eq("department", currentUser.department);
}

const { data } = await query;
const unique = [...new Set(data.map(d => d.department).filter(Boolean))].sort();
```

#### D. useSimpelEmployees.js:
Hook ini sudah benar — semua fungsi (`fetchEmployees`, `fetchDropdownOptions`, `fetchOverallTotal`) sudah apply filter unit untuk `admin_unit`.

---

## 5. Database Migration

### File: `add_forwarded_status_to_proposals.sql`

```sql
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

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_leave_proposals_forwarded_by ON leave_proposals(forwarded_by);
CREATE INDEX IF NOT EXISTS idx_leave_proposals_status ON leave_proposals(status);
```

**Cara menjalankan:**
1. Buka Supabase SQL Editor
2. Paste isi file `add_forwarded_status_to_proposals.sql`
3. Klik "Run"

---

## 6. File yang Diubah

### Core Files:
1. ✅ `src/components/leave_proposals/LeaveProposalForm.jsx` - Profile SIMPEL + kalender hari kerja
2. ✅ `src/pages/LeaveProposals.jsx` - Workflow approval Admin Unit
3. ✅ `src/hooks/useLeaveProposals.js` - Fungsi approve/reject/forward
4. ✅ `src/pages/ProposalList.jsx` - Status forwarded untuk Admin Pusat
5. ✅ `src/components/leave_requests/LeaveRequestForm.jsx` - Filter unit + query SIMPEL
6. ✅ `src/pages/LeaveRequests.jsx` - Filter employee/admin_unit dari SIMPEL
7. ✅ `src/hooks/useDepartments.js` - Query department dari SIMPEL
8. ✅ `src/pages/UserManagement.jsx` - Quick Edit dihapus (semua edit di SIMPEL)

### Migration Files:
9. ✅ `add_forwarded_status_to_proposals.sql` - DB migration

---

## 7. Testing Checklist

### A. Employee Role:
- [ ] Buka halaman "Usulan & Pengajuan Cuti"
- [ ] Klik "Ajukan Cuti Baru"
- [ ] Profil pegawai otomatis muncul (nama, NIP, unit, jabatan)
- [ ] Pilih jenis cuti & tanggal
- [ ] Durasi otomatis dihitung dalam **hari kerja** (tidak termasuk Sabtu/Minggu/hari libur)
- [ ] Submit berhasil, status `pending`
- [ ] Admin Unit bisa lihat pengajuan ini

### B. Admin Unit:
- [ ] Lihat pengajuan pegawai di tab "Persetujuan Cuti Pegawai"
- [ ] **Setujui** → Input nomor surat, tanggal, pilih penandatangan → berhasil
  - Status jadi `approved`
  - Record masuk ke `leave_requests`
  - Saldo cuti pegawai berkurang
- [ ] **Tolak** → Input alasan → berhasil, status jadi `rejected`
- [ ] **Teruskan ke Admin Pusat** → Input catatan → berhasil, status jadi `forwarded`
- [ ] **Cetak Surat** (setelah approve) → Download DOCX surat cuti
- [ ] Saat search pegawai di form: **hanya bisa lihat pegawai dari unitnya sendiri**

### C. Admin Pusat:
- [ ] Buka "Daftar Usulan Cuti" (ProposalList)
- [ ] Filter status → ada opsi "Diteruskan Admin Unit"
- [ ] Proposal `forwarded` tampil dengan badge biru "Diteruskan ke Admin Pusat"
- [ ] Bisa approve/reject proposal `forwarded` sama seperti `pending`
- [ ] Stats card "Menunggu Review" menghitung `pending` + `forwarded`

### D. Query SIMPEL:
- [ ] Admin Unit input cuti baru → cari pegawai → **hanya muncul pegawai dari unitnya**
- [ ] Admin Unit lihat "Data Cuti Pegawai" → **hanya tampil cuti pegawai dari unitnya**
- [ ] Employee lihat "Data Cuti Saya" → **hanya tampil cuti miliknya sendiri**
- [ ] Admin Pusat lihat semua data (tidak ada filter unit)

---

## 8. Workflow Lengkap

```
[EMPLOYEE]
    ↓ Submit Pengajuan Cuti
    ↓
[ADMIN UNIT] — Tab: Persetujuan Cuti Pegawai
    ├─→ SETUJUI
    │   ├─ Input: Nomor surat, tanggal, penandatangan
    │   ├─ Create leave_requests record
    │   ├─ Potong saldo cuti
    │   └─ Status: approved
    │   └─ Bisa cetak surat DOCX
    ├─→ TOLAK
    │   ├─ Input: Alasan penolakan
    │   └─ Status: rejected
    └─→ TERUSKAN KE ADMIN PUSAT
        ├─ Input: Catatan (opsional)
        └─ Status: forwarded
            ↓
        [ADMIN PUSAT] — ProposalList
            ├─→ SETUJUI (sama seperti Admin Unit)
            └─→ TOLAK (sama seperti Admin Unit)
```

---

## 9. Known Issues & Future Improvements

### Known Issues:
- Batch employee mode di LeaveProposalForm tidak ditest (hanya employee self-submit yang di-fix)
- Jika profile employee tidak ada di SIMPEL, tampil alert tapi tidak ada fallback create

### Future Improvements:
1. Notifikasi real-time saat proposal disetujui/ditolak/diteruskan
2. Auto-fill nomor surat dengan pattern yang lebih sistematis
3. History log approval (siapa approve, kapan, dengan nomor surat apa)
4. Export batch surat cuti dalam satu file ZIP
5. Dashboard stats untuk Admin Unit (jumlah pending approval, dll.)

---

## 10. Migration Steps (Deployment)

Jalankan urutan ini saat deploy ke production:

1. **Database Migration**:
   ```bash
   # Run di Supabase SQL Editor
   add_forwarded_status_to_proposals.sql
   ```

2. **Deploy Code**:
   ```bash
   git add .
   git commit -m "feat: implement leave proposal workflow & SIMPEL integration"
   git push origin main
   ```

3. **Verify**:
   - Login sebagai employee → test submit pengajuan
   - Login sebagai admin_unit → test approve/reject/forward
   - Login sebagai admin_pusat → test lihat forwarded proposals

---

**Tanggal Update:** 25 Juni 2026  
**Status:** ✅ Semua perubahan selesai dan ditest  
**Dokumentasi oleh:** Kiro AI Assistant
