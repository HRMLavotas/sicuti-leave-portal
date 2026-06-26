import { supabase } from "./supabaseClient";
import { AuditLogger, AUDIT_EVENTS } from "./auditLogger";

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

  /** @deprecated Gunakan setSession dari SSO exchange */
  static setUserSession(user) {
    console.warn("[AuthManager] setUserSession deprecated — gunakan setSession via SSO exchange");
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

  static clearSession() {
    localStorage.removeItem("user_data");
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
      localStorage.setItem("user_data", JSON.stringify(user));
    } else {
      localStorage.removeItem("user_data");
    }
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
