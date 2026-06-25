import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthManager } from "@/lib/auth";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * AuthCallback — Pure JWT decode, no server calls
 *
 * Mendukung dua format dari SIMPEL ssoRedirect:
 *   1. Query string: /auth/callback?access_token=...&refresh_token=...
 *   2. URL hash:    /auth/callback#access_token=...&refresh_token=...
 *   3. Auth code:   /auth/callback?code=... (belum diimplementasi, redirect ke SIMPEL)
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

const SIMPEL_AUTH_URL = "https://simpel.sipandai.site/auth";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [statusMsg, setStatusMsg] = useState("Memverifikasi token...");
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const handleCallback = () => {
      // Cek query string dulu (?access_token=...)
      const queryParams = new URLSearchParams(window.location.search);
      // Cek URL hash juga (#access_token=...)
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const access_token  = queryParams.get("access_token")  || hashParams.get("access_token");
      const refresh_token = queryParams.get("refresh_token") || hashParams.get("refresh_token");
      const code          = queryParams.get("code");

      // Kalau ada code (OAuth flow), redirect ke SIMPEL — belum diimplementasi
      if (code && !access_token) {
        setErrorMsg("Authorization code flow belum didukung. Silakan login ulang melalui SIPANDAI.");
        return;
      }

      if (!access_token) {
        console.warn("[SSO] Token tidak ditemukan, redirect ke SIPANDAI");
        window.location.replace(
          `${SIMPEL_AUTH_URL}?redirect=${encodeURIComponent(window.location.origin + "/auth/callback")}`
        );
        return;
      }

      // Bersihkan token dari URL (query + hash)
      window.history.replaceState({}, document.title, "/auth/callback");

      // Decode JWT lokal — tidak ada network request
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
      const emailPrefix = payload.email.split("@")[0];

      const user = {
        id:            payload.sub,
        email:         payload.email,
        name:          meta.full_name || emailPrefix,
        role,
        unit_kerja:    meta.department || "Belum Ditetapkan",
        department:    meta.department || "Belum Ditetapkan",
        nip:           meta.nip || (/^\d+$/.test(emailPrefix) ? emailPrefix : null),
        permissions:   getPermissionsForRole(role),
        access_token,
        refresh_token: refresh_token || null,
        last_login:    new Date().toISOString(),
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
            href={`${SIMPEL_AUTH_URL}?redirect=${encodeURIComponent(window.location.origin + "/auth/callback")}`}
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