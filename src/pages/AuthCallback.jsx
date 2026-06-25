import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthManager } from "@/lib/auth";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * AuthCallback — Pure JWT decode, no server calls
 *
 * SIMPEL kirim token via URL:
 *   /auth/callback?access_token=...&refresh_token=...
 *
 * Kita decode JWT lokal → simpan ke AuthManager (localStorage)
 * Tidak ada /api/auth-sso, tidak ada Supabase GoTrueClient call
 */

function decodeJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function getPermissionsForRole(role) {
  if (role === "admin_pusat")    return ["all"];
  if (role === "admin_pimpinan") return ["all_readonly"];
  if (role === "admin_unit")     return ["dashboard", "employees_unit", "leave_requests_unit", "leave_history_unit", "surat_keterangan_unit"];
  return ["leave_requests_self", "leave_history_self"];
}

const AuthCallback = () => {
  const navigate = useNavigate();
  const [statusMsg, setStatusMsg] = useState("Memverifikasi token...");
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const handleCallback = () => {
      // Baca token dari query string
      const params = new URLSearchParams(window.location.search);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (!access_token) {
        console.warn("[SSO] Token tidak ditemukan, redirect ke SIPANDAI");
        window.location.replace(
          `https://sipandai.site/auth?redirect=${encodeURIComponent(window.location.origin + "/auth/callback")}`
        );
        return;
      }

      // Bersihkan token dari URL
      window.history.replaceState({}, document.title, "/auth/callback");

      // Decode JWT lokal
      const payload = decodeJwt(access_token);

      if (!payload || !payload.sub || !payload.email) {
        setErrorMsg("Token SSO tidak valid. Silakan login ulang melalui SIPANDAI.");
        return;
      }

      // Cek expired
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        setErrorMsg("Sesi sudah kadaluarsa. Silakan login ulang melalui SIPANDAI.");
        return;
      }

      const meta = payload.user_metadata || {};
      const role = meta.role || "employee";

      const user = {
        id:          payload.sub,
        email:       payload.email,
        name:        meta.full_name || payload.email.split("@")[0],
        role,
        unit_kerja:  meta.department || "Belum Ditetapkan",
        department:  meta.department || "Belum Ditetapkan",
        nip:         meta.nip || (/^\d+$/.test(payload.email.split("@")[0]) ? payload.email.split("@")[0] : null),
        permissions: getPermissionsForRole(role),
        access_token,
        refresh_token: refresh_token || null,
        last_login:  new Date().toISOString(),
      };

      console.log("[SSO] Login berhasil:", user.email, "| Role:", user.role);
      AuthManager.setUserSession(user);

      setStatusMsg("Berhasil! Mengalihkan...");

      if (user.role === "employee") {
        navigate("/leave-requests", { replace: true });
      } else {
        navigate("/employees", { replace: true });
      }
    };

    handleCallback();
  }, [navigate]);

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="text-white font-semibold text-lg">Login SSO Gagal</h2>
          <p className="text-slate-400 text-sm leading-relaxed">{errorMsg}</p>
          <a
            href={`https://sipandai.site/auth?redirect=${encodeURIComponent(window.location.origin + "/auth/callback")}`}
            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            Kembali ke Portal SIPANDAI
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="text-center space-y-4">
        <Loader2 className="w-10 h-10 text-purple-500 animate-spin mx-auto" />
        <p className="text-white text-lg font-medium">{statusMsg}</p>
        <p className="text-slate-400 text-sm">Menghubungkan sesi dari SIPANDAI</p>
      </div>
    </div>
  );
};

export default AuthCallback;