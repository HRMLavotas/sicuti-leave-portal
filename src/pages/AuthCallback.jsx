import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { AuthManager } from "@/lib/auth";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * AuthCallback — SSO callback handler untuk SiCuti
 *
 * Mendukung tiga format dari SIMPEL ssoRedirect:
 *   1. ?code=xxx          → tukar via /api/auth-sso → setSession Supabase SiCuti (PREFERRED)
 *   2. #access_token=...  → hash fallback, langsung setSession
 *   3. ?access_token=...  → query fallback, langsung setSession
 */

const SIMPEL_AUTH_URL = "https://sipandai.site/auth";

function getPermissionsForRole(role) {
  if (role === "admin_pusat")    return ["all"];
  if (role === "admin_pimpinan") return ["all_readonly"];
  if (role === "admin_unit")     return ["dashboard","employees_unit","leave_requests_unit","leave_history_unit","surat_keterangan_unit"];
  return ["leave_requests_self", "leave_history_self"];
}

const AuthCallback = () => {
  const navigate = useNavigate();
  const [statusMsg, setStatusMsg] = useState("Memverifikasi sesi...");
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      const queryParams = new URLSearchParams(window.location.search);
      const hashParams  = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const code          = queryParams.get("code");
      const sso_error     = queryParams.get("sso_error");
      const access_token  = queryParams.get("access_token")  || hashParams.get("access_token");
      const refresh_token = queryParams.get("refresh_token") || hashParams.get("refresh_token");

      // Bersihkan URL secepatnya
      window.history.replaceState({}, document.title, "/auth/callback");

      // SSO code flow gagal di sisi SIPANDAI
      if (sso_error) {
        setErrorMsg("Sesi SSO gagal dibuat. Silakan login ulang melalui portal SIPANDAI.");
        return;
      }

      // ── Opsi 1: Authorization code (preferred) ──────────────────────────
      if (code) {
        setStatusMsg("Menukar kode autentikasi...");
        try {
          const res = await fetch("/api/auth-sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "SSO exchange gagal");

          // Set session Supabase SiCuti
          const { error: sessionError } = await supabase.auth.setSession({
            access_token:  data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          if (sessionError) throw sessionError;

          // Simpan info user ke AuthManager juga
          if (data.user) {
            const role = data.user.role || "employee";
            AuthManager.setUserSession({
              id:          data.user.id,
              email:       data.user.email,
              name:        data.user.name,
              role,
              department:  data.user.department || "Belum Ditetapkan",
              unit_kerja:  data.user.department || "Belum Ditetapkan",
              nip:         data.user.nip || null,
              permissions: getPermissionsForRole(role),
              access_token:  data.session.access_token,
              refresh_token: data.session.refresh_token,
              last_login:  new Date().toISOString(),
            });
          }

          setStatusMsg("Berhasil! Mengalihkan...");
          navigateAfterLogin(data.user?.role);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "SSO gagal";
          console.error("[AuthCallback] code exchange error:", msg);
          setErrorMsg(msg);
          return;
        }
      }

      // ── Opsi 2: Hash / query fallback ────────────────────────────────────
      if (access_token && refresh_token) {
        setStatusMsg("Memulai sesi...");
        try {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) throw sessionError;

          // Ambil data user dari session yang baru di-set
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user) {
            const meta = userData.user.user_metadata || {};
            const role = meta.role || "employee";
            AuthManager.setUserSession({
              id:          userData.user.id,
              email:       userData.user.email,
              name:        meta.full_name || userData.user.email,
              role,
              department:  meta.department || "Belum Ditetapkan",
              unit_kerja:  meta.department || "Belum Ditetapkan",
              nip:         meta.nip || null,
              permissions: getPermissionsForRole(role),
              access_token,
              refresh_token,
              last_login:  new Date().toISOString(),
            });
            setStatusMsg("Berhasil! Mengalihkan...");
            navigateAfterLogin(role);
          } else {
            throw new Error("Tidak dapat mengambil data user");
          }
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Set session gagal";
          console.error("[AuthCallback] setSession error:", msg);
          setErrorMsg(msg);
          return;
        }
      }

      // ── Tidak ada credentials ─────────────────────────────────────────────
      console.warn("[AuthCallback] Tidak ada token/code, redirect ke SIPANDAI");
      window.location.replace(
        `${SIMPEL_AUTH_URL}?redirect=${encodeURIComponent(window.location.origin + "/auth/callback")}`
      );
    };

    const navigateAfterLogin = (role) => {
      if (role === "employee") {
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
