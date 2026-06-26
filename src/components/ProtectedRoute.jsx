import React, { useEffect, useState } from "react";
import { redirectToSimpelLogin } from "@/lib/supabaseSSO";
import { AuthManager } from "@/lib/auth";

/**
 * ProtectedRoute — cek AuthManager session (localStorage dari SSO SIMPEL)
 */
const ProtectedRoute = ({ children }) => {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        // Refresh dari Supabase/SIMPEL jika ada, update cache
        await AuthManager.refreshUserSession();
      } catch (error) {
        console.warn("[ProtectedRoute] Session refresh failed:", error?.message || error);
        AuthManager.clearSession();
      }

      if (cancelled) return;

      if (AuthManager.isAuthenticated()) {
        setStatus("authenticated");
      } else {
        setStatus("redirecting");
        redirectToSimpelLogin();
      }
    };

    checkAuth();
    return () => { cancelled = true; };
  }, []);

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">
            {status === "redirecting" ? "Mengalihkan ke SIPANDAI..." : "Memverifikasi sesi..."}
          </p>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
