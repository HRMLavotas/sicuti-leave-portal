# Sync Google Drive Secrets from SIMPEL to SiCuti

## Problem
Google Drive API key di SiCuti berbeda dengan yang di SIMPEL, sehingga upload dokumen gagal dengan error "Invalid API key".

## Solution
Copy secrets dari SIMPEL ke SiCuti menggunakan Supabase CLI.

## Steps

### 1. Get secrets from SIMPEL (already done in this project)
Secrets yang perlu di-sync:
- `GOOGLE_DRIVE_API_KEY` 
- `LOVABLE_API_KEY`

### 2. Set secrets di SiCuti

Jalankan command berikut untuk set secrets di SiCuti:

```powershell
# Set access token untuk SiCuti
$env:SUPABASE_ACCESS_TOKEN="YOUR_SICUTI_ACCESS_TOKEN"

# Set GOOGLE_DRIVE_API_KEY (ganti VALUE dengan nilai asli dari .env SIMPEL)
npx supabase secrets set GOOGLE_DRIVE_API_KEY="YOUR_GOOGLE_DRIVE_API_KEY_FROM_SIMPEL" --project-ref ociedycfgkqvcqwdxprt

# Set LOVABLE_API_KEY (ganti VALUE dengan nilai asli dari .env SIMPEL)
npx supabase secrets set LOVABLE_API_KEY="YOUR_LOVABLE_API_KEY_FROM_SIMPEL" --project-ref ociedycfgkqvcqwdxprt
```

### 3. Verify secrets

```powershell
npx supabase secrets list --project-ref ociedycfgkqvcqwdxprt
```

Check bahwa digest untuk `GOOGLE_DRIVE_API_KEY` dan `LOVABLE_API_KEY` sama dengan yang di SIMPEL.

### 4. Restart edge functions (optional)

Edge functions akan otomatis reload dengan secrets baru, tapi jika perlu restart manual:

```powershell
npx supabase functions deploy leave-doc-upload --project-ref ociedycfgkqvcqwdxprt --no-verify-jwt
```

## Verification

Test upload dokumen di aplikasi SiCuti untuk memastikan tidak ada error "Invalid API key" lagi.

## Notes

- Secrets disimpan encrypted di Supabase
- Digest yang ditampilkan adalah hash dari nilai secret
- Jika digest sama = nilai secret sama
- Jika digest berbeda = nilai secret berbeda

## Security

⚠️ **PENTING**: Jangan commit nilai asli secret ke Git! File ini hanya berisi instruksi, bukan nilai secret.
