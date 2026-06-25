import { supabase } from "./supabaseClient";
import bcrypt from "bcryptjs";
import { RateLimiter } from "./rateLimiter";
import { AuditLogger, AUDIT_EVENTS } from "./auditLogger";

// Token management with expiration
const TOKEN_KEY = "auth_token";
const USER_KEY = "user_data";
const EXPIRY_KEY = "token_expiry";
const TOKEN_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export class AuthManager {
  static setUserSession(user) {
    const expiryTime = Date.now() + TOKEN_DURATION;

    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      localStorage.setItem(TOKEN_KEY, `auth_${Date.now()}`);
      localStorage.setItem(EXPIRY_KEY, expiryTime.toString());
    } catch (error) {
      console.error("Failed to set user session:", error);
      throw new Error("Failed to save login session");
    }
  }

  static getUserSession() {
    try {
      const user = localStorage.getItem(USER_KEY);
      const token = localStorage.getItem(TOKEN_KEY);
      const expiry = localStorage.getItem(EXPIRY_KEY);

      if (!user || !token || !expiry) {
        return null;
      }

      // Check if token is expired
      if (Date.now() > parseInt(expiry)) {
        this.clearSession();
        return null;
      }

      const parsedUser = JSON.parse(user);

      // DEBUG: Log user session data in development
      if (import.meta.env.DEV && Math.random() < 0.1) { // Log 10% of the time to avoid spam
        console.log("ðŸ” AuthManager.getUserSession():", {
          id: parsedUser.id,
          name: parsedUser.name,
          role: parsedUser.role,
          unit_kerja: parsedUser.unit_kerja,
          unitKerja: parsedUser.unitKerja,
          hasUnitData: !!(parsedUser.unit_kerja || parsedUser.unitKerja)
        });
      }

      return parsedUser;
    } catch (error) {
      console.error("Failed to get user session:", error);
      this.clearSession();
      return null;
    }
  }

  static clearSession() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  }

  static isAuthenticated() {
    return this.getUserSession() !== null;
  }

  // DEPRECATED: Login via username/password tidak dipakai lagi
  // Auth sepenuhnya via SSO dari SIMPEL
  static async login(username, password) {
    throw new Error("Login via username/password sudah tidak didukung. Gunakan SSO melalui Portal SIPANDAI.");
    /* Original login code disabled
    if (!username || !password) {
      throw new Error("Username dan password wajib diisi");
    }

    // Input sanitization
    const sanitizedUsername = username.trim().toLowerCase();

    // Check rate limiting
    const rateLimitCheck = RateLimiter.isBlocked(sanitizedUsername);
    if (rateLimitCheck && rateLimitCheck.blocked) {
      const timeRemaining = RateLimiter.formatTimeRemaining(
        rateLimitCheck.remainingTime,
      );
      AuditLogger.logSecurityEvent(AUDIT_EVENTS.LOGIN_BLOCKED, {
        username: sanitizedUsername,
        attempts: rateLimitCheck.attempts,
        remainingTime: rateLimitCheck.remainingTime,
      });
      throw new Error(
        `Terlalu banyak percobaan login. Coba lagi dalam ${timeRemaining}`,
      );
    }

    try {
      // Get user from database
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", sanitizedUsername)
        .single();

      if (error || !user) {
        // Record failed attempt
        RateLimiter.recordAttempt(sanitizedUsername, false);
        AuditLogger.logLogin(
          sanitizedUsername,
          false,
          "Username tidak ditemukan",
        );
        throw new Error("Username tidak ditemukan");
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        // Record failed attempt
        const attemptResult = RateLimiter.recordAttempt(
          sanitizedUsername,
          false,
        );
        const remaining = RateLimiter.getRemainingAttempts(sanitizedUsername);

        AuditLogger.logLogin(sanitizedUsername, false, "Password salah");

        if (attemptResult.lockedUntil) {
          const timeRemaining = RateLimiter.formatTimeRemaining(
            attemptResult.remainingTime,
          );
          throw new Error(
            `Password salah. Akun diblokir selama ${timeRemaining}`,
          );
        } else {
          throw new Error(`Password salah. ${remaining} percobaan tersisa`);
        }
      }

      // Record successful attempt
      RateLimiter.recordAttempt(sanitizedUsername, true);
      AuditLogger.logLogin(sanitizedUsername, true);

      // Remove sensitive data before storing
      const { password: _, ...safeUser } = user;

      // Map database field names to frontend field names
      const mappedUser = {
        ...safeUser,
        unitKerja: safeUser.unit_kerja || safeUser.unitKerja // Ensure unitKerja is available
      };

      // Set session
      this.setUserSession(mappedUser);

      return safeUser;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  }

      */ // End of disabled login code
  }

  static logout() {
    const user = this.getUserSession();
    AuditLogger.logLogout(user?.id);
    this.clearSession();
  }

  static hasRole(requiredRole) {
    const user = this.getUserSession();
    if (!user) return false;

    const roleHierarchy = { employee: 1, admin_unit: 2, admin_pimpinan: 3, admin_pusat: 4 };

    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 999;

    return userLevel >= requiredLevel;
  }

  static canAccessUnit(unitName) {
    const user = this.getUserSession();
    if (!user) return false;

    // Master admin can access everything
    if (user.role === "admin_pusat" || user.role === "admin_pimpinan") return true;

    // Admin unit can only access their own unit
    if (user.role === "admin_unit") {
      const userUnit = user.unit_kerja || user.unitKerja;
      return userUnit === unitName;
    }

    // Employees can only access their own data
    return false;
  }

  // NEW: Check if user can access template management features
  static canAccessTemplateManagement() {
    const user = this.getUserSession();
    if (!user) return false;

    // Both master_admin and admin_unit can access template management
    return user.role === "admin_pusat" || user.role === "admin_unit";
  }

  // NEW: Check if user can access letter creation features
  static canAccessLetterCreation() {
    const user = this.getUserSession();
    if (!user) return false;

    // Both master_admin and admin_unit can access letter creation
    return user.role === "admin_pusat" || user.role === "admin_unit";
  }

  // NEW: Get template scope for current user
  static getTemplateScope() {
    const user = this.getUserSession();
    if (!user) return null;

    if (user.role === "admin_pusat" || user.role === "admin_pimpinan") {
      return "global"; // Can access all templates
    } else if (user.role === "admin_unit") {
      return "unit"; // Can only access their own unit's templates
    }

    return null;
  }
}

// Input sanitization helpers
export const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;

  return input
    .trim()
    .replace(/[<>]/g, "") // Basic XSS protection
    .substring(0, 255); // Limit length
};

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password) => {
  // Minimum 8 characters, at least one letter and one number
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
  return passwordRegex.test(password);
};