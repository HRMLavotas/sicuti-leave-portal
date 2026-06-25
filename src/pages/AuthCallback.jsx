import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseAuth, supabaseData, supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { AuthManager } from "@/lib/auth";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [statusMsg, setStatusMsg] = useState("Mengautentikasi...");
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (!access_token || !refresh_token) {
        console.warn("[SSO] Tidak ada token, redirect ke landing");
        navigate("/", { replace: true });
        return;
      }

      try {
        setStatusMsg("Memverifikasi token...");
        let sessionUser = null;

        const { data: sessionData, error: sessionError } = await supabaseAuth.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) {
          console.warn("[SSO] setSession gagal, decode JWT fallback:", sessionError.message);
          try {
            const base64Url = access_token.split(".")[1];
            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
            const payload = JSON.parse(window.atob(base64));
            sessionUser = { id: payload.sub, email: payload.email, user_metadata: payload.user_metadata || {} };
            console.log("[SSO] JWT decode fallback berhasil:", sessionUser.email);
          } catch (decodeErr) {
            console.error("[SSO] JWT decode fallback gagal:", decodeErr);
            setErrorMsg("Token SSO tidak valid. Silakan login ulang melalui SIPANDAI.");
            return;
          }
        } else {
          sessionUser = sessionData.user;
          console.log("[SSO] setSession berhasil:", sessionUser?.email);
        }

        if (!sessionUser?.email) {
          setErrorMsg("Data pengguna tidak ditemukan dalam token. Silakan login ulang.");
          return;
        }

        window.history.replaceState({}, document.title, "/auth/callback");

        setStatusMsg("Mengambil data profil...");
        let profile = null;
        let userRole = "employee";
        let userNip = null;

        const { data: profileData } = await supabaseSimpelAdmin
          .from("profiles")
          .select("*")
          .or("email.eq." + sessionUser.email + ",id.eq." + sessionUser.id)
          .maybeSingle();
        profile = profileData;

        const { data: roleData } = await supabaseSimpelAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", sessionUser.id)
          .maybeSingle();

        const simpelRole = roleData?.role || sessionUser.user_metadata?.role;
        if (simpelRole === "admin_pusat" || simpelRole === "admin_pimpinan" || simpelRole === "admin_super") {
          userRole = "master_admin";
        } else if (simpelRole === "admin_unit") {
          userRole = "admin_unit";
        }
        console.log("[SSO] Role:", simpelRole, "->", userRole);

        if (profile?.nip) {
          userNip = profile.nip;
        } else {
          const emailPrefix = sessionUser.email.split("@")[0];
          if (/^\d+$/.test(emailPrefix)) userNip = emailPrefix;
        }

        let permissions = [];
        if (userRole === "master_admin") {
          permissions = ["all"];
        } else if (userRole === "admin_unit") {
          permissions = ["dashboard", "employees_unit", "leave_requests_unit", "leave_history_unit", "surat_keterangan_unit"];
        } else {
          permissions = ["leave_requests_self", "leave_history_self"];
        }

        setStatusMsg("Menyinkronkan data pengguna...");
        const usernamePrefix = sessionUser.email.split("@")[0];

        const { data: localUser, error: localUserError } = await supabaseData
          .from("users")
          .select("*")
          .or("email.eq." + sessionUser.email + ",username.eq." + usernamePrefix)
          .maybeSingle();

        if (localUserError) {
          console.error("[SSO] Gagal query user SiCuti:", localUserError.message);
          setErrorMsg("Gagal menyinkronkan data (" + localUserError.message + "). Hubungi administrator.");
          return;
        }

        let finalUser = localUser;

        if (!localUser) {
          console.log("[SSO] Auto-provisioning user baru:", sessionUser.email);
          const { data: createdUser, error: createErr } = await supabaseData
            .from("users")
            .insert([{
              name: profile?.full_name || sessionUser.email,
              username: usernamePrefix,
              password: "sso_managed_login",
              email: sessionUser.email,
              role: userRole,
              unit_kerja: profile?.department || null,
              nip: userNip,
              status: "active",
              permissions,
              last_login: new Date().toISOString(),
            }])
            .select()
            .single();

          if (createErr) {
            console.error("[SSO] Auto-provisioning gagal:", createErr.message);
            setErrorMsg("Gagal mendaftarkan pengguna (" + createErr.message + "). Hubungi administrator.");
            return;
          }
          finalUser = createdUser;
          console.log("[SSO] Auto-provisioning berhasil:", finalUser.email);
        } else {
          const updates = {};
          let needsUpdate = false;
          if (localUser.role !== userRole) { updates.role = userRole; updates.permissions = permissions; needsUpdate = true; }
          if (!localUser.nip && userNip) { updates.nip = userNip; needsUpdate = true; }
          if (profile?.department && localUser.unit_kerja !== profile.department) { updates.unit_kerja = profile.department; needsUpdate = true; }

          if (needsUpdate) {
            updates.last_login = new Date().toISOString();
            const { data: updated } = await supabaseData.from("users").update(updates).eq("id", localUser.id).select().single();
            if (updated) finalUser = updated;
          } else {
            await supabaseData.from("users").update({ last_login: new Date().toISOString() }).eq("id", localUser.id);
          }
        }

        const mappedUser = { ...finalUser, unitKerja: finalUser.unit_kerja || finalUser.unitKerja };
        AuthManager.setUserSession(mappedUser);
        console.log("[SSO] Login sukses:", mappedUser.name, "| Role:", mappedUser.role);
        setStatusMsg("Berhasil! Mengalihkan...");

        if (mappedUser.role === "employee") {
          navigate("/leave-requests", { replace: true });
        } else {
          navigate("/employees", { replace: true });
        }
      } catch (err) {
        console.error("[SSO] Error tidak terduga:", err);
        setErrorMsg("Terjadi kesalahan: " + (err.message || String(err)) + ". Silakan coba lagi.");
      }
    };

    handleCallback();
  }, [navigate]);

  const simpelPortalUrl = "https://sipandai.site/portal";

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
          </div>
          <h2 className="text-white font-semibold text-lg">Login SSO Gagal</h2>
          <p className="text-slate-400 text-sm leading-relaxed">{errorMsg}</p>
          <a
            href={simpelPortalUrl}
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
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-white text-lg font-medium">{statusMsg}</p>
        <p className="text-slate-400 text-sm">Menghubungkan sesi dari SIPANDAI</p>
      </div>
    </div>
  );
};

export default AuthCallback;