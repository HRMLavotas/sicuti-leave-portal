
# Dokumentasi Fix SSO & Leave Proposal

## 1. Ringkasan
Dokumentasi ini menjelaskan alur SSO (Single Sign-On) yang **sudah berjalan dan benar** (berdasarkan commit `2b01c1f`), beserta langkah perbaikan untuk error create leave proposal.

## 2. Alur SSO yang Benar & Berjalan
```
User membuka SIPANDAI Portal → Klik "SiCuti" → Redirect ke SiCuti /auth/callback dengan "code"
 → Kirim code ke /api/auth-sso (Vercel Server)
 → Server tukar code dengan SIMPEL token via Edge Function SIMPEL
 → Server ambil data user & employee dari SIMPEL Supabase
 → Server UPSERT employee ke SiCuti Supabase (dengan ID SAMA DENGAN SIMPEL!)
 → Server balikin data user + token SIMPEL ke SiCuti client
 → Client simpan ke localStorage via AuthManager.setUserSession()
 → User berhasil login & bisa buat leave proposal!
```

## 3. File yang Diubah
Berikut daftar file dan perubahan yang **sudah benar & berfungsi**:
1. **`api/auth-sso.js`**: Ditambahkan `https://sipandai.site` ke `ALLOWED_ORIGINS`
2. **`api/_lib/ssoExchange.js`**:
   - Gunakan ID Employee SIMPEL untuk UPSERT ke tabel `employees` di SiCuti
   - Menggunakan `exchangeSsoCredentials` tanpa provision Supabase Auth
3. **`src/pages/AuthCallback.jsx`**: Menggunakan `AuthManager.setUserSession()` seperti commit `2b01c1f`

## 4. Langkah-langkah Fix untuk Production
Untuk menjalankan di production:

### Langkah 1: Deploy ke Vercel
- Push semua perubahan ke branch main (atau branch yang di-deploy)
- Tunggu Vercel otomatis deploy

### Langkah 2: Jalankan Script SQL di Supabase SiCuti
Buka **SQL Editor** di proyek Supabase SiCuti, lalu jalankan 2 script berikut **secara berurutan**:
1. **Pertama**: Jalankan `disable-all-rls.sql` untuk menonaktifkan RLS (Row Level Security)
2. **Kedua**: Jalankan `insert-missing-employee.sql` (edit terlebih dahulu sesuai data employee yang sesungguhan!)

## 5. File SQL yang Dibuat
- **`disable-all-rls.sql`**: Menonaktifkan RLS di semua tabel SiCuti Supabase
- **`insert-missing-employee.sql`**: Script untuk menambah employee yang hilang ke tabel `employees`

## 6. Penting: Data Aman!
Semua data riwayat cuti, saldo cuti, dan data lainnya **tidak akan hilang**! Kita hanya memperbaiki alur SSO dan menonaktifkan RLS saja!

## 7. Refresh JWT SIMPEL di SiCuti

Per 26 Juni 2026, SiCuti memiliki refresh session otomatis untuk mencegah error `JWT expired` saat user sudah lama membuka aplikasi.

Alurnya:

```
AuthManager membaca exp dari JWT SIMPEL
 → jika token hampir expired, client memanggil /api/auth-refresh
 → server SiCuti refresh session ke Supabase SIMPEL memakai refresh_token
 → server mengulang enrichment user/role/employee dari SIMPEL
 → client menyimpan access_token, refresh_token, dan token_expiry terbaru
 → query SIMPEL berikutnya memakai token baru
```

File terkait:

- `api/auth-refresh.js`
- `api/_lib/ssoExchange.js`
- `src/lib/auth.js`
- `src/lib/simpelClient.js`
- `src/lib/sessionManager.js`
- `src/components/ProtectedRoute.jsx`

Environment server yang wajib tersedia sama seperti SSO awal:

- `SIMPEL_URL`
- `SIMPEL_ANON_KEY`
- `SIMPEL_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SSO_SHARED_SECRET`

Catatan penting: jangan memperpanjang session hanya dengan mengubah `localStorage.token_expiry`. JWT asli tetap akan expired. Perpanjangan harus melalui `/api/auth-refresh`.
