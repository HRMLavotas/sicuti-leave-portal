import React, { useEffect, useState } from "react";
import { redirectToSimpelLogin, getAuthSession } from "@/lib/supabaseSSO";
import { AuthManager } from "@/lib/auth";

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null = loading

  useEffect(() => {
    const checkAuth = async () => {
      const session = await getAuthSession();
      const hasLocalSession = AuthManager.isAuthenticated();
      setIsAuthenticated(!!session || hasLocalSession);
    };
    checkAuth();
  }, []);

  // Tampilkan loading spinner sementara cek sesi
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Jika belum login → redirect ke SIMPEL
  if (!isAuthenticated) {
    redirectToSimpelLogin();
    return null;
  }

  return children;
};

export default ProtectedRoute;

