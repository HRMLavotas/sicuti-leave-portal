import { supabase } from "./supabaseClient";
import { AuditLogger, AUDIT_EVENTS } from "./auditLogger";

const SSO_REFRESH_SKEW_MS = 2 * 60 * 1000;
const SSO_REFRESH_STORAGE_KEY = "sso_last_refresh_attempt";

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getExpiryMsFromToken(token) {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

function isJwtExpiredError(error) {
  const message = String(error?.message || error?.error_description || error || "").toLowerCase();
  return (
    message.includes("jwt expired") ||
    message.includes("token expired") ||
    message.includes("invalid jwt") ||
    message.includes("refresh token")
  );
}

/**
 * AuthManager — integrasi dengan Supabase Auth session (RLS-aware)
 *
 * SSO flow:
 * 1. AuthCallback → exchangeSsoCredentials → supabase.auth.setSession()
 * 2. Semua authorization via JWT user_metadata (role, department, employee_id)
 * 3. Logout → supabase.auth.signOut()
 */
export class AuthManager {
  static mapUserFromSession(session) {
    if (!session?.user) return null;

    const meta = session.user.user_metadata ?? {};
    return {
      id: session.user.id,
      email: session.user.email,
      name: meta.full_name || session.user.email,
      role: meta.role || "employee",
      department: meta.department || "Belum Ditetapkan",
      nip: meta.nip || null,
      employee_id: meta.employee_id || null,
      permissions: meta.permissions || [],
      last_login: new Date().toISOString(),
    };
  }

  static async setSession(session) {
    if (!session?.access_token) {
      throw new Error("Session token tidak valid");
    }

    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    if (error) throw error;
  }

  /**
   * Digunakan untuk SSO dari SIMPEL, simpan user ke localStorage tanpa Supabase Auth
   */
  static async establishSsoSession({ user, session, simpel_session }) {
    const accessToken = simpel_session?.access_token || session?.access_token;
    const refreshToken = simpel_session?.refresh_token || session?.refresh_token;
    const tokenExpiryMs = getExpiryMsFromToken(accessToken);

    this.setSsoSession({
      ...user,
      permissions: user.permissions || [],
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: session?.expires_at || (tokenExpiryMs ? Math.floor(tokenExpiryMs / 1000) : 0),
      last_login: new Date().toISOString(),
    });
  }

  /**
   * Simpan sesi SSO (token SIMPEL + profil user) ke localStorage
   */
  static setSsoSession(user) {
    try {
      const expiryMs =
        user?.expires_at && Number(user.expires_at) > 0
          ? Number(user.expires_at) * 1000
          : getExpiryMsFromToken(user?.access_token);

      const normalizedUser = {
        ...user,
        expires_at: expiryMs ? Math.floor(expiryMs / 1000) : user?.expires_at || 0,
      };

      localStorage.setItem("user_data", JSON.stringify(normalizedUser));
      if (expiryMs) {
        localStorage.setItem("token_expiry", String(expiryMs));
      } else {
        localStorage.removeItem("token_expiry");
      }
    } catch (error) {
      console.error("Failed to set SSO session:", error);
      throw new Error("Failed to save login session");
    }
  }

  /** @deprecated Gunakan setSsoSession atau establishSsoSession */
  static setUserSession(user) {
    try {
      localStorage.setItem("user_data", JSON.stringify(user));
    } catch (error) {
      console.error("Failed to set user session:", error);
      throw new Error("Failed to save login session");
    }
  }

  static getUserSession() {
    try {
      // Sync read dari localStorage cache (diupdate oleh onAuthStateChange)
      const cached = localStorage.getItem("user_data");
      if (cached) return JSON.parse(cached);

      return null;
    } catch (error) {
      console.error("Failed to get user session:", error);
      return null;
    }
  }

  static async refreshUserSession() {
    await this.ensureFreshSsoSession();

    // Cek Supabase Auth session (untuk user yang login via Supabase native)
    const { data } = await supabase.auth.getSession();
    const user = this.mapUserFromSession(data.session);
    if (user) {
      // Update cache dari Supabase Auth
      localStorage.setItem("user_data", JSON.stringify(user));
      return user;
    }
    // Jika tidak ada Supabase session, jangan hapus cache SSO (dari SIMPEL)
    // Kembalikan apa yang ada di localStorage
    return this.getUserSession();
  }

  static getSessionExpiryMs(user = this.getUserSession()) {
    if (!user) return null;

    const storedExpiry = Number(localStorage.getItem("token_expiry"));
    if (Number.isFinite(storedExpiry) && storedExpiry > 0) return storedExpiry;

    const expiryMs =
      user.expires_at && Number(user.expires_at) > 0
        ? Number(user.expires_at) * 1000
        : getExpiryMsFromToken(user.access_token);

    if (expiryMs) {
      localStorage.setItem("token_expiry", String(expiryMs));
    }
    return expiryMs || null;
  }

  static isAuthTokenError(error) {
    return isJwtExpiredError(error);
  }

  static async ensureFreshSsoSession({ force = false } = {}) {
    const user = this.getUserSession();
    if (!user?.refresh_token) return user;

    const expiryMs = this.getSessionExpiryMs(user);
    const shouldRefresh = force || !expiryMs || expiryMs - Date.now() <= SSO_REFRESH_SKEW_MS;
    if (!shouldRefresh) return user;

    const lastAttempt = Number(localStorage.getItem(SSO_REFRESH_STORAGE_KEY) || 0);
    if (!force && lastAttempt && Date.now() - lastAttempt < 30 * 1000) {
      return user;
    }

    localStorage.setItem(SSO_REFRESH_STORAGE_KEY, String(Date.now()));

    const res = await fetch("/api/auth-refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: user.refresh_token }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || "Gagal memperbarui sesi SSO");
    }

    const refreshedUser = {
      ...user,
      ...(data.user || {}),
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token || user.refresh_token,
      expires_at: data.session?.expires_at || 0,
      permissions: data.user?.permissions || user.permissions || [],
      last_login: user.last_login || new Date().toISOString(),
      last_refresh: new Date().toISOString(),
    };

    this.setSsoSession(refreshedUser);
    return refreshedUser;
  }

  static clearSession() {
    localStorage.removeItem("user_data");
    localStorage.removeItem("token_expiry");
    localStorage.removeItem(SSO_REFRESH_STORAGE_KEY);
  }

  static isAuthenticated() {
    return this.getUserSession() !== null;
  }

  static async login() {
    throw new Error(
      "Login via username/password sudah tidak didukung. Gunakan SSO melalui Portal SIPANDAI.",
    );
  }

  static async logout() {
    const user = this.getUserSession();
    AuditLogger.logLogout(user?.id);
    this.clearSession();
    await supabase.auth.signOut();
    const portalUrl = import.meta.env.VITE_SIMPEL_APP_URL || "https://simpel.sipandai.site";
    window.location.href = `${portalUrl}/portal`;
  }

  static hasRole(requiredRole) {
    const user = this.getUserSession();
    if (!user) return false;

    const roleHierarchy = {
      employee: 1,
      admin_unit: 2,
      admin_pimpinan: 3,
      admin_pusat: 4,
    };

    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 999;

    return userLevel >= requiredLevel;
  }

  static canAccessUnit(unitName) {
    const user = this.getUserSession();
    if (!user) return false;

    if (user.role === "admin_pusat" || user.role === "admin_pimpinan") return true;

    if (user.role === "admin_unit") {
      return user.department === unitName;
    }

    return false;
  }

  static canAccessTemplateManagement() {
    const user = this.getUserSession();
    if (!user) return false;
    return user.role === "admin_pusat" || user.role === "admin_unit";
  }

  static canAccessLetterCreation() {
    const user = this.getUserSession();
    if (!user) return false;
    return user.role === "admin_pusat" || user.role === "admin_unit";
  }

  static getTemplateScope() {
    const user = this.getUserSession();
    if (!user) return null;

    if (user.role === "admin_pusat" || user.role === "admin_pimpinan") {
      return "global";
    }
    if (user.role === "admin_unit") {
      return "unit";
    }
    return null;
  }
}

// Sinkronkan localStorage cache dengan Supabase Auth state
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = AuthManager.mapUserFromSession(session);
    if (user) {
      const existing = AuthManager.getUserSession();
      localStorage.setItem(
        "user_data",
        JSON.stringify({
          ...user,
          permissions:
            user.permissions?.length
              ? user.permissions
              : existing?.permissions || [],
          access_token: existing?.access_token,
          refresh_token: existing?.refresh_token,
        }),
      );
    }
    // JANGAN hapus cache jika tidak ada Supabase session (karena user pakai SSO dari SIMPEL!)
  });
}

export const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;
  return input.trim().replace(/[<>]/g, "").substring(0, 255);
};

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password) => {
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
  return passwordRegex.test(password);
};
