import { createClient } from "@supabase/supabase-js";

/**
 * SSO Integration: SIMPEL sebagai Master Auth, SiCuti sebagai Consumer
 *
 * supabaseAuth  → Supabase SIMPEL (untuk autentikasi/login)
 * supabaseData  → Supabase SiCuti (untuk query data cuti, pakai service_role)
 */

const validateEnv = () => {
  const required = {
    VITE_SIMPEL_URL: import.meta.env.VITE_SIMPEL_URL,
    VITE_SIMPEL_ANON_KEY: import.meta.env.VITE_SIMPEL_ANON_KEY,
    VITE_SIMPEL_SERVICE_ROLE_KEY: import.meta.env.VITE_SIMPEL_SERVICE_ROLE_KEY,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_SERVICE_ROLE_KEY: import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error("[SSO Config] Environment variables yang hilang:", missing);
  } else {
    console.log("[SSO Config] Semua environment variables terdeteksi");
  }

  return missing.length === 0;
};

const isConfigValid = validateEnv();

// Client untuk AUTH — terhubung ke project SIMPEL
export const supabaseAuth = createClient(
  import.meta.env.VITE_SIMPEL_URL,
  import.meta.env.VITE_SIMPEL_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "simpel-auth-session",
    },
  }
);

// Client untuk DATA — terhubung ke project SiCuti (service_role bypass RLS)
export const supabaseData = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// Client admin untuk SIMPEL (service_role) — sinkronisasi profiles & roles
export const supabaseSimpelAdmin = createClient(
  import.meta.env.VITE_SIMPEL_URL,
  import.meta.env.VITE_SIMPEL_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * Redirect pengguna ke halaman login SIMPEL.
 * Setelah login, SIMPEL akan kirim token ke /auth/callback SiCuti.
 */
export const redirectToSimpelLogin = () => {
  const sicutiCallbackUrl = `${window.location.origin}/auth/callback`;
  const redirectUrl = `https://sipandai.site/auth?redirect=${encodeURIComponent(sicutiCallbackUrl)}`;

  console.log("[SSO] Redirect ke SIMPEL:", redirectUrl);
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
 * Logout dari SIMPEL dan redirect kembali ke Portal SIPANDAI
 */
export const signOut = async () => {
  await supabaseAuth.auth.signOut();
  window.location.href = "https://sipandai.site/portal";
};

/**
 * Check apakah konfigurasi SSO sudah lengkap
 */
export const isSSOConfigured = () => isConfigValid;

/**
 * Get status konfigurasi environment variables
 */
export const getConfigStatus = () => ({
  VITE_SIMPEL_URL: !!import.meta.env.VITE_SIMPEL_URL,
  VITE_SIMPEL_ANON_KEY: !!import.meta.env.VITE_SIMPEL_ANON_KEY,
  VITE_SIMPEL_SERVICE_ROLE_KEY: !!import.meta.env.VITE_SIMPEL_SERVICE_ROLE_KEY,
  VITE_SUPABASE_URL: !!import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_SERVICE_ROLE_KEY: !!import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
});