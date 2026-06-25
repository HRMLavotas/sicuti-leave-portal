import React from "react";
import { redirectToSimpelLogin } from "@/lib/supabaseSSO";
import { AuthManager } from "@/lib/auth";

/**
 * ProtectedRoute — cek auth dari localStorage (AuthManager)
 * Synchronous, tidak perlu async/await karena data dari localStorage
 */
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = AuthManager.isAuthenticated();

  if (!isAuthenticated) {
    redirectToSimpelLogin();
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Mengalihkan ke SIPANDAI...</p>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;