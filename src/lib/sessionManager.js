import { AuthManager } from "./auth";
import { AuditLogger, AUDIT_EVENTS } from "./auditLogger";

/**
 * Enhanced session management with security features
 */

const SESSION_CHECK_INTERVAL = 60000; // Check every minute
const ACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity
const SESSION_EXTEND_THRESHOLD = 5 * 60 * 1000; // Extend session if less than 5 minutes left

export class SessionManager {
  static instance = null;
  static intervalId = null;
  static lastActivity = Date.now();
  static warningShown = false;

  static getInstance() {
    if (!this.instance) {
      this.instance = new SessionManager();
    }
    return this.instance;
  }

  static init() {
    this.updateActivity();
    this.startSessionMonitoring();
    this.bindActivityListeners();
  }

  static startSessionMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.checkSession();
    }, SESSION_CHECK_INTERVAL);
  }

  static stopSessionMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  static bindActivityListeners() {
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    const updateActivity = () => this.updateActivity();

    events.forEach((event) => {
      document.addEventListener(event, updateActivity, true);
    });

    // Listen for visibility changes
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.updateActivity();
      }
    });
  }

  static updateActivity() {
    this.lastActivity = Date.now();
    this.warningShown = false;
  }

  static async checkSession() {
    if (!AuthManager.isAuthenticated()) {
      this.stopSessionMonitoring();
      return;
    }

    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;
    const user = AuthManager.getUserSession();

    // Check for inactivity timeout
    if (timeSinceActivity > ACTIVITY_TIMEOUT) {
      await this.handleInactivityTimeout();
      return;
    }

    // Check if session is about to expire
    const expiryTime = AuthManager.getSessionExpiryMs(user);
    if (!expiryTime) return;

    const timeToExpiry = expiryTime - now;

    // Show warning if session expires in 5 minutes
    if (
      timeToExpiry <= 5 * 60 * 1000 &&
      timeToExpiry > 0 &&
      !this.warningShown
    ) {
      this.showSessionWarning(Math.ceil(timeToExpiry / 1000 / 60));
      this.warningShown = true;
    }

    // Auto-extend session if user is active and session is about to expire
    if (timeToExpiry <= SESSION_EXTEND_THRESHOLD && timeToExpiry > 0) {
      if (timeSinceActivity < 5 * 60 * 1000) {
        // User was active in last 5 minutes
        await this.extendSession();
      }
    }

    // Handle expired session
    if (timeToExpiry <= 0) {
      await this.handleSessionExpiry();
    }
  }

  static async handleInactivityTimeout() {
    AuditLogger.log(AUDIT_EVENTS.SESSION_EXPIRED, {
      reason: "inactivity_timeout",
      lastActivity: new Date(this.lastActivity).toISOString(),
    });

    this.showInactivityModal();
  }

  static async handleSessionExpiry() {
    const user = AuthManager.getUserSession();

    try {
      await AuthManager.ensureFreshSsoSession({ force: true });
      return;
    } catch {
      // Refresh token sudah tidak valid, lanjutkan logout normal.
    }

    AuditLogger.log(AUDIT_EVENTS.SESSION_EXPIRED, {
      reason: "token_expired",
      userId: user?.id,
    });

    AuthManager.logout();
    this.stopSessionMonitoring();

    // Show session expired message
    this.showSessionExpiredModal();
  }

  static async extendSession() {
    await AuthManager.ensureFreshSsoSession({ force: true });
    console.log("Session refreshed from SIMPEL");
  }

  static showSessionWarning(minutesLeft) {
    // Create warning toast or modal
    if (window.toast) {
      window.toast({
        title: "Sesi Akan Berakhir",
        description: `Sesi Anda akan berakhir dalam ${minutesLeft} menit. Klik di mana saja untuk memperpanjang.`,
        variant: "warning",
        duration: 10000,
      });
    }
  }

  static showInactivityModal() {
    // Create modal for inactivity timeout
    const modal = document.createElement("div");
    modal.innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-slate-800 rounded-lg p-6 max-w-md mx-4 border border-slate-700">
          <h3 class="text-white text-lg font-semibold mb-4">Sesi Tidak Aktif</h3>
          <p class="text-slate-300 mb-6">
            Sesi Anda telah tidak aktif selama 30 menit. Demi keamanan, silakan login kembali.
          </p>
          <div class="flex gap-3">
            <button onclick="this.closest('div[class*=fixed]').remove(); window.location.href='/login'" 
                    class="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
              Login Kembali
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Auto redirect after 10 seconds
    setTimeout(() => {
      window.location.href = "/login";
    }, 10000);
  }

  static showSessionExpiredModal() {
    // Create modal for session expiry
    const modal = document.createElement("div");
    modal.innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-slate-800 rounded-lg p-6 max-w-md mx-4 border border-slate-700">
          <h3 class="text-white text-lg font-semibold mb-4">Sesi Berakhir</h3>
          <p class="text-slate-300 mb-6">
            Sesi Anda telah berakhir. Silakan login kembali untuk melanjutkan.
          </p>
          <div class="flex gap-3">
            <button onclick="window.location.href='/login'" 
                    class="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
              Login Kembali
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  static getSessionInfo() {
    if (!AuthManager.isAuthenticated()) {
      return null;
    }

    const expiryTime = AuthManager.getSessionExpiryMs();
    const now = Date.now();

    return {
      isActive: true,
      expiresAt: expiryTime ? new Date(expiryTime) : null,
      timeLeft: expiryTime ? Math.max(0, expiryTime - now) : null,
      lastActivity: new Date(this.lastActivity),
      timeSinceActivity: now - this.lastActivity,
    };
  }

  static cleanup() {
    this.stopSessionMonitoring();

    // Remove activity listeners
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];
    const updateActivity = () => this.updateActivity();

    events.forEach((event) => {
      document.removeEventListener(event, updateActivity, true);
    });
  }
}

// Auto-initialize session management
if (typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    if (AuthManager.isAuthenticated()) {
      SessionManager.init();
    }
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    SessionManager.cleanup();
  });
}

export default SessionManager;
