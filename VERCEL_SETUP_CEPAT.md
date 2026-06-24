# ⚡ Setup Vercel - Cara Tercepat

## Error Yang Muncul:
```
Uncaught Error: supabaseUrl is required
```

## Penyebab:
Environment variables belum di-set di Vercel

---

## 🚀 Solusi (5 Menit):

### 1️⃣ Login ke Vercel
Buka: https://vercel.com/dashboard

### 2️⃣ Pilih Project Anda
Klik project **sicuti-leave-portal**

### 3️⃣ Masuk ke Settings
**Settings** → **Environment Variables**

### 4️⃣ Copy-Paste Variables Ini:

Untuk setiap variable, klik **Add New**, paste name & value, lalu centang **Production + Preview + Development**

```
Name: VITE_SUPABASE_URL
Value: https://ociedycfgkqvcqwdxprt.supabase.co
```

```
Name: VITE_SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jaWVkeWNmZ2txdmNxd2R4cHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2OTkxNDksImV4cCI6MjA2NTI3NTE0OX0.QQP-4esGf1C3mdxTECskuY66beHsuqwVEgnpcBJ32B4
```

```
Name: VITE_SUPABASE_PUBLISHABLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jaWVkeWNmZ2txdmNxd2R4cHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2OTkxNDksImV4cCI6MjA2NTI3NTE0OX0.QQP-4esGf1C3mdxTECskuY66beHsuqwVEgnpcBJ32B4
```

```
Name: VITE_SUPABASE_SERVICE_ROLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jaWVkeWNmZ2txdmNxd2R4cHJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTY5OTE0OSwiZXhwIjoyMDY1Mjc1MTQ5fQ.j4AzaxD2layIcpVzjJEM1U3l4_tqtnEYwH9bPI1B0Mo
```

```
Name: VITE_SIMPEL_URL
Value: https://mauyygrbdopmpdpnwzra.supabase.co
```

```
Name: VITE_SIMPEL_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdXl5Z3JiZG9wbXBkcG53enJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MzEzODQsImV4cCI6MjA5MDUwNzM4NH0.rO9oPY2jbax8GNVjW_rkaE8T4FqrV6OoJa7ME96p4bQ
```

```
Name: VITE_SIMPEL_SERVICE_ROLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdXl5Z3JiZG9wbXBkcG53enJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDkzMTM4NCwiZXhwIjoyMDkwNTA3Mzg0fQ.qMJoz6Xuy4PKwS-LKWpjf_WM5o0fuNtEE4hsgLjJX4Q
```

```
Name: VITE_SIMPEL_APP_URL
Value: https://sipandai.site
```

### 5️⃣ Redeploy

**Deployments** → klik **⋯** (titik tiga) pada deployment terakhir → **Redeploy**

---

## ✅ Verifikasi

Setelah deployment selesai (~2-3 menit):

1. Buka URL production Anda
2. Tekan **F12** → **Console**
3. **Tidak ada error** "supabaseUrl is required" ✅
4. Aplikasi berjalan normal ✅

---

## 📸 Screenshot Langkah-Langkah

### Tampilan "Add New" Environment Variable:

```
┌─────────────────────────────────────────┐
│ Name:                                   │
│ ┌─────────────────────────────────────┐ │
│ │ VITE_SUPABASE_URL                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Value:                                  │
│ ┌─────────────────────────────────────┐ │
│ │ https://ocied...supabase.co         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Environment:                            │
│ ☑ Production                            │
│ ☑ Preview                               │
│ ☑ Development                           │
│                                         │
│         [Cancel]  [Save]                │
└─────────────────────────────────────────┘
```

---

## ⚠️ PENTING:

1. **Centang SEMUA environments** (Production + Preview + Development)
2. **Redeploy WAJIB** setelah menambah variables
3. Jangan edit file `.env` di Git (sudah di-ignore)

---

## 🐛 Masih Error?

### Cek 1: Environment Variables Sudah Tersimpan?
Settings → Environment Variables → Lihat daftar

### Cek 2: Sudah Redeploy?
Deployments → Lihat deployment terbaru (setelah add variables)

### Cek 3: Build Logs
Deployments → [pilih deployment] → View Build Logs
Cari: "Environment variables loaded"

---

**Estimasi Waktu:** 5-10 menit
**Status Terakhir:** Menunggu setup environment variables di Vercel
