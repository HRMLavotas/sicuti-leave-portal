import { createClient } from "@supabase/supabase-js";

/**
 * supabaseSSO.js
 * 
 * Dua client saja:
 *   supabaseSimpelAdmin → SIMPEL DB (service_role, untuk read employees/profiles)
 *   supabaseData        → SiCuti DB (service_role, untuk read/write data cuti)
 * 
 * TIDAK ADA lagi supabaseAuth karena auth sepenuhnya lewat JWT decode di AuthCallback.
 * Ini menghilangkan "Multiple GoTrueClient" warning.
 */

const validateEnv = () => {
  const required = {
    VITE_SIMPEL_URL:              import.meta.env.VITE_SIMPEL_URL,
    VITE_SIMPEL_SERVICE_ROLE_KEY: import.meta.env.VITE_SIMPEL_SERVICE_ROLE_KEY,
    VITE_SUPABASE_URL:            import.meta.env.VITE_SUPABASE_URL,
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

/**
 * Client SIMPEL — service_role, untuk query employees/profiles/user_roles
 * READ-ONLY dari perspektif SiCuti (tidak write ke SIMPEL kecuali update role)
 */
export const supabaseSimpelAdmin = createClient(
  import.meta.env.VITE_SIMPEL_URL,
  import.meta.env.VITE_SIMPEL_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

// Alias untuk backward compat — sama dengan supabaseSimpelAdmin
export const supabaseAuth = supabaseSimpelAdmin;

/**
 */