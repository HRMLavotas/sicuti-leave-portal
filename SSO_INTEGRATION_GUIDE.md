# 🔐 Panduan Integrasi SSO SIMPEL - SiCuti

## Arsitektur SSO

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   SiCuti     │          │    SIMPEL    │          │  Supabase    │
│  (Consumer)  │◄────────►│  (Provider)  │◄────────►│  (Backend)   │
└──────────────┘          └──────────────┘          └──────────────┘
```

### Komponen:

1. **SIMPEL (SSO Provider)**
   - URL: `https://sipandai.site`
   - Supabase URL: `https://mauyygrbdopmpdpnwzra.supabase.co`
   - Fungsi: Autentikasi user, simpan data pegawai
   
2. **SiCuti (SSO Consumer)**
   - URL: `https://your-sicuti-app.vercel.app`
   - Supabase URL: `https://ociedycfgkqvcqwdxprt.supabase.co`
   - Fungsi: Aplikasi cuti, konsumsi data dari SIMPEL

---

## 🔄 Alur Login SSO

### 1. User Klik "Login via SIMPEL" di SiCuti

**File:** `src/pages/Landing.jsx`

```javascript
import { redirectToSimpelLogin } from "@/lib/supabaseSSO";

<button onClick={redirectToSimpelLogin}>
  Login via SIMPEL
</button>
```

**Fungsi:** `src/lib/supabaseSSO.js`

```javascript
export const redirectToSimpelLogin = () => {
  const simpelAppUrl = import.meta.env.VITE_SIMPEL_APP_URL; // https://sipandai.site
  const sicutiCallbackUrl = `${window.location.origin}/auth/callback`;
  const redirectUrl = `${simpelAppUrl}/auth?redirect=${encodeURIComponent(sicutiCallbackUrl)}`;
  window.location.href = redirectUrl;
};
```

**Redirect ke:**
```
https://sipandai.site/auth?redirect=https%3A%2F%2Fyour-sicuti-app.vercel.app%2Fauth%2Fcallback
```

---

### 2. User Login di SIMPEL

**Yang Harus Ada di SIMPEL:**

1. **Route `/auth`** yang menerima parameter `redirect`
2. **Form Login** untuk user memasukkan NIP & password
3. **Proses Autentikasi** ke Supabase SIMPEL
4. **Generate Token** setelah login berhasil
5. **Redirect kembali** ke SiCuti dengan token

**Contoh Redirect dari SIMPEL:**
```javascript
// Di aplikasi SIMPEL setelah login berhasil:
const { access_token, refresh_token } = session;
const callbackUrl = new URL(redirectParam); // dari query param
callbackUrl.searchParams.set('access_token', access_token);
callbackUrl.searchParams.set('refresh_token', refresh_token);
window.location.href = callbackUrl.toString();
```

**URL Redirect:**
```
https://your-sicuti-app.vercel.app/auth/callback?access_token=eyJ...&refresh_token=eyJ...
```

---

### 3. SiCuti Menerima Token di `/auth/callback`

**File:** `src/pages/AuthCallback.jsx`

**Proses:**

```javascript
// 1. Ambil token dari URL query params
const params = new URLSearchParams(window.location.search);
const access_token = params.get("access_token");
const refresh_token = params.get("refresh_token");

// 2. Set session di Supabase Auth SIMPEL
await supabaseAuth.auth.setSession({ access_token, refresh_token });

// 3. Ambil data user dari SIMPEL
const { data: profile } = await supabaseSimpelAdmin
  .from("profiles")
  .select("*")
  .eq("email", sessionUser?.email)
  .maybeSingle();

// 4. Cek apakah user sudah terdaftar di database SiCuti
const { data: localUser } = await supabaseData
  .from("users")
  .select("*")
  .eq("email", sessionUser?.email)
  .maybeSingle();

// 5. Auto-provisioning jika user belum ada
if (!localUser) {
  await supabaseData.from("users").insert([newUser]);
}

// 6. Simpan sesi lokal dan redirect ke dashboard
AuthManager.setUserSession(user);
navigate("/employees");
```

---

## 🔧 Environment Variables

### SiCuti (.env)

```env
# Supabase SiCuti (untuk data cuti)
VITE_SUPABASE_URL="https://ociedycfgkqvcqwdxprt.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJ..."
VITE_SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Supabase SIMPEL (untuk autentikasi)
VITE_SIMPEL_URL="https://mauyygrbdopmpdpnwzra.supabase.co"
VITE_SIMPEL_ANON_KEY="eyJ..."
VITE_SIMPEL_SERVICE_ROLE_KEY="eyJ..."

# URL Frontend SIMPEL (untuk redirect login)
VITE_SIMPEL_APP_URL="https://sipandai.site"
```

### SIMPEL (.env)

```env
# Supabase SIMPEL
VITE_SUPABASE_URL="https://mauyygrbdopmpdpnwzra.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJ..."
VITE_SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Allowed callback URLs (whitelist)
ALLOWED_CALLBACK_URLS="https://your-sicuti-app.vercel.app/auth/callback"
```

---

## ✅ Checklist Implementasi

### Di Aplikasi SIMPEL:

- [ ] **Route `/auth` sudah ada** dan menerima parameter `?redirect=...`
- [ ] **Form login** berfungsi dengan autentikasi Supabase
- [ ] **Setelah login berhasil:**
  - [ ] Ambil `access_token` dan `refresh_token` dari session
  - [ ] Redirect ke URL callback dengan token di query params
  - [ ] Format: `{redirect_url}?access_token=...&refresh_token=...`
- [ ] **Validasi callback URL** (security: hanya allow domain yang terdaftar)

### Di Aplikasi SiCuti:

- [x] **Landing page** memiliki button "Login via SIMPEL"
- [x] **Function `redirectToSimpelLogin()`** mengarah ke SIMPEL
- [x] **Route `/auth/callback`** sudah ada
- [x] **AuthCallback** memproses token dan auto-provisioning user
- [ ] **Environment variables** sudah dikonfigurasi dengan benar
  - [ ] Local: file `.env`
  - [ ] Production: Vercel Environment Variables

---

## 🐛 Troubleshooting

### Issue 1: Klik "Login via SIMPEL" tidak redirect

**Kemungkinan Penyebab:**
1. `VITE_SIMPEL_APP_URL` tidak di-set atau salah
2. Function `redirectToSimpelLogin` tidak terpanggil

**Cara Cek:**
```javascript
// Di browser console:
console.log(import.meta.env.VITE_SIMPEL_APP_URL);
// Output seharusnya: https://sipandai.site
```

**Solusi:**
- Pastikan `.env` sudah ada dan benar
- Restart dev server: `npm run dev`

---

### Issue 2: Redirect ke SIMPEL tapi 404 Not Found

**Kemungkinan Penyebab:**
Route `/auth` tidak ada di aplikasi SIMPEL

**Solusi:**
Tambahkan route `/auth` di aplikasi SIMPEL yang menerima parameter `redirect`

---

### Issue 3: Login di SIMPEL berhasil tapi tidak kembali ke SiCuti

**Kemungkinan Penyebab:**
1. SIMPEL tidak mengirim token ke callback URL
2. Redirect URL tidak di-encode dengan benar

**Solusi:**
Di SIMPEL, setelah login berhasil:
```javascript
// Ambil redirect URL dari query param
const redirectUrl = new URL(searchParams.get('redirect'));

// Tambahkan token
const { data: { session } } = await supabase.auth.getSession();
redirectUrl.searchParams.set('access_token', session.access_token);
redirectUrl.searchParams.set('refresh_token', session.refresh_token);

// Redirect
window.location.href = redirectUrl.toString();
```

---

### Issue 4: Callback URL tidak aman (CORS/Security)

**Best Practice:**
Di SIMPEL, validasi callback URL sebelum redirect:

```javascript
const allowedDomains = [
  'https://your-sicuti-app.vercel.app',
  'http://localhost:5173' // untuk development
];

const redirectUrl = new URL(searchParams.get('redirect'));
if (!allowedDomains.includes(redirectUrl.origin)) {
  throw new Error('Invalid callback URL');
}
```

---

## 🧪 Testing SSO

### Test Manual:

1. **Buka SiCuti:** `https://your-sicuti-app.vercel.app`
2. **Klik "Login via SIMPEL"**
3. **Cek URL redirect:** Seharusnya ke `https://sipandai.site/auth?redirect=...`
4. **Login di SIMPEL** dengan NIP & password
5. **Cek redirect kembali:** Seharusnya ke `/auth/callback?access_token=...`
6. **Cek berhasil login:** Dashboard SiCuti muncul

### Test dengan Console:

```javascript
// 1. Test redirect function
import { redirectToSimpelLogin } from '@/lib/supabaseSSO';
redirectToSimpelLogin();

// 2. Test environment variables
console.log({
  simpelUrl: import.meta.env.VITE_SIMPEL_URL,
  simpelAppUrl: import.meta.env.VITE_SIMPEL_APP_URL,
  sicutiUrl: import.meta.env.VITE_SUPABASE_URL
});

// 3. Test callback parsing
const params = new URLSearchParams(window.location.search);
console.log({
  access_token: params.get('access_token'),
  refresh_token: params.get('refresh_token')
});
```

---

## 📋 Struktur Database

### SIMPEL Database (mauyygrbdopmpdpnwzra)

**Table: profiles**
```sql
id          | uuid (PK)
email       | text
full_name   | text
nip         | text
department  | text
created_at  | timestamp
```

**Table: user_roles**
```sql
id          | uuid (PK)
user_id     | uuid (FK -> profiles.id)
role        | text (admin_pusat, admin_unit, employee)
created_at  | timestamp
```

### SiCuti Database (ociedycfgkqvcqwdxprt)

**Table: users**
```sql
id          | uuid (PK)
email       | text
username    | text
name        | text
nip         | text
role        | text (master_admin, admin_unit, employee)
unit_kerja  | text
permissions | text[]
status      | text
last_login  | timestamp
created_at  | timestamp
```

---

## 🔒 Security Considerations

1. **Token di URL Query Params:**
   - Token akan terlihat di browser history
   - Gunakan HTTPS untuk enkripsi
   - Token harus short-lived (expire cepat)

2. **Callback URL Validation:**
   - Whitelist domain yang diizinkan
   - Validasi di server-side SIMPEL

3. **Service Role Key:**
   - Jangan expose di client-side
   - Gunakan hanya di server-side atau backend functions

4. **Auto-provisioning:**
   - User otomatis terdaftar setelah login pertama kali
   - Role di-sync dari SIMPEL
   - Pastikan default permissions aman

---

## 📞 Support

Jika masih ada masalah:

1. **Cek Console Logs:** Buka DevTools (F12) → Console
2. **Cek Network Tab:** Monitor request/response
3. **Cek Environment Variables:** Pastikan semua sudah benar
4. **Cek Route SIMPEL:** Pastikan `/auth` route ada dan berfungsi

---

**Last Updated:** 2026-06-24
**Version:** 1.0.0
