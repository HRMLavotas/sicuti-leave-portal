import { createClient } from "@supabase/supabase-js";

/**
 * SSO Integration: SIMPEL sebagai Master Auth, SiCuti sebagai Consumer
 *
 * supabaseAuth  → Supabase SIMPEL (untuk autentikasi/login)
 * supabaseData  → Supabase SiCuti (untuk query data cuti, pakai service_role)
 */

// Validasi environment variables
const validateEnv = () => {
  const required = {
    VITE_SIMPEL_URL: import.meta.env.VITE_SIMPEL_URL,
    VITE_SIMPEL_ANON_KEY: import.meta.env.VITE_SIMPEL_ANON_KEY,
    VITE_SIMPEL_SERVICE_ROLE_KEY: import.meta.env.VITE_SIMPEL_SERVICE_ROLE_KEY,
    VITE_SIMPEL_APP_URL: import.meta.env.VITE_SIMPEL_APP_URL,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_SERVICE_ROLE_KEY: import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  };

  const missing = Object.entries(required)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error("[SSO Config] ❌ Environment variables yang hilang:", missing);
    console.error("[SSO Config] Aplikasi mungkin tidak berfungsi dengan baik!");
    console.error("[SSO Config] Pastikan semua variable sudah dikonfigurasi di Vercel/Environment");
  } else {
    console.log("[SSO Config] ✅ Semua environment variables terdeteksi");
  }

  return missing.length === 0;
};

// Jalankan validasi saat module di-load
const isConfigValid = validateEnv();

// Client untuk AUTH - terhubung ke project SIMPEL
export const supabaseAuth = createClient(
  import.meta.env.VITE_SIMPEL_URL || "https://placeholder.supabase.co",
  import.meta.env.VITE_SIMPEL_ANON_KEY || "placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "simpel-auth-session", // key unik agar tidak bentrok
    },
  }
);

// Client untuk DATA - terhubung ke project SiCuti (service_role bypass RLS)
export const supabaseData = createClient(
  import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "placeholder",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// Client admin untuk SIMPEL (service_role) untuk sinkronisasi data pegawai & user profiles
export const supabaseSimpelAdmin = createClient(
  import.meta.env.VITE_SIMPEL_URL || "https://placeholder.supabase.co",
  import.meta.env.VITE_SIMPEL_SERVICE_ROLE_KEY || "placeholder",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * Redirect pengguna ke halaman login SIMPEL
 * Setelah login, SIMPEL akan kirim token ke /auth/callback SiCuti
 */
export const redirectToSimpelLogin = () => {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const simpelAppUrl = isLocal 
    ? (import.meta.env.VITE_SIMPEL_APP_URL || "http://localhost:8080")
    : "https://sipandai.site";
  
  const sicutiCallbackUrl = `${window.location.origin}/auth/callback`;
  const redirectUrl = `${simpelAppUrl}/auth?redirect=${encodeURIComponent(sicutiCallbackUrl)}`;
  
  console.log("[SSO] Redirect ke SIMPEL:", redirectUrl);
  console.log("[SSO] Callback URL:", sicutiCallbackUrl);
  
  window.location.href = redirectUrl;
};

/**
 * Cek apakah user sudah login (berdasarkan sesi SIMPEL)
 */
export const getAuthSession = async () => {
  const { data, error } = await supabaseAuth.auth.getSession();
  if (error) return null;
  return data.session;
};

/**
 * Ambil data user yang sedang login
 */
export const getAuthUser = async () => {
  const { data, error } = await supabaseAuth.auth.getUser();
  if (error) return null;
  return data.user;
};

/**
 * Logout dari SIMPEL dan redirect kembali ke SiCuti landing page
 */
export const signOut = async () => {
  await supabaseAuth.auth.signOut();
  window.location.href = "/";
};

/**
 * Check apakah konfigurasi SSO sudah lengkap
 */
export const isSSOConfigured = () => {
  return isConfigValid;
};

/**
 * Get status konfigurasi environment variables
 */
export const getConfigStatus = () => {
  return {
    VITE_SIMPEL_URL: !!import.meta.env.VITE_SIMPEL_URL,
    VITE_SIMPEL_ANON_KEY: !!import.meta.env.VITE_SIMPEL_ANON_KEY,
    VITE_SIMPEL_SERVICE_ROLE_KEY: !!import.meta.env.VITE_SIMPEL_SERVICE_ROLE_KEY,
    VITE_SIMPEL_APP_URL: !!import.meta.env.VITE_SIMPEL_APP_URL,
    VITE_SUPABASE_URL: !!import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_SERVICE_ROLE_KEY: !!import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  };
};
