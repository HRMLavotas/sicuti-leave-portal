import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseAuth, supabaseData, supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { AuthManager } from "@/lib/auth";

/**
 * Halaman penerima token SSO dari SIMPEL.
 * SIMPEL akan redirect ke: /auth/callback?access_token=...&refresh_token=...
 */
const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      // Jika tidak ada token → balik ke landing page
      if (!access_token || !refresh_token) {
        console.warn("[SSO] Tidak ada token diterima, redirect ke landing page");
        navigate("/", { replace: true });
        return;
      }

      try {
        let sessionUser = null;

        // Set session di SiCuti menggunakan token dari SIMPEL
        const { data: sessionData, error: sessionError } = await supabaseAuth.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) {
          console.warn("[SSO] Formal setSession failed, attempting fallback JWT decode:", sessionError.message);
          
          try {
            // Fallback: Decode token JWT client-side
            const base64Url = access_token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(window.atob(base64));
            
            sessionUser = {
              id: payload.sub,
              email: payload.email,
              user_metadata: payload.user_metadata || {}
            };
            console.log("[SSO] Fallback JWT decode successful:", sessionUser.email);
          } catch (decodeErr) {
            console.error("[SSO] Fallback JWT decode also failed:", decodeErr);
            navigate("/", { replace: true });
            return;
          }
        } else {
          sessionUser = sessionData.user;
          console.log("[SSO] Login berhasil di auth SIMPEL:", sessionUser?.email);
        }

        const usernamePrefix = sessionUser?.email ? sessionUser.email.split("@")[0] : "";
        // Ambil data user dari database SiCuti menggunakan email ATAU username dari SIMPEL
        const { data: localUser, error: localUserError } = await supabaseData
          .from("users")
          .select("*")
          .or(`email.eq.${sessionUser?.email},username.eq.${usernamePrefix}`)
          .maybeSingle();

        if (localUserError) {
          console.error("[SSO] Gagal query user ke database SiCuti:", localUserError.message);
          navigate("/?error=db_error", { replace: true });
          return;
        }

        let finalUser = localUser;

        // 1. Ambil data profiles dari database SIMPEL (coba by email dulu, lalu by auth UUID)
        let profile = null;
        const { data: profileByEmail, error: profileErrByEmail } = await supabaseSimpelAdmin
          .from("profiles")
          .select("*")
          .eq("email", sessionUser?.email)
          .maybeSingle();

        if (profileErrByEmail) {
          console.error("[SSO] Gagal mengambil profil dari SIMPEL (by email):", profileErrByEmail.message);
        }

        profile = profileByEmail;

        // Fallback: cari profile by auth UUID (profiles.id = auth.users.id di SIMPEL)
        if (!profile && sessionUser?.id) {
          const { data: profileById, error: profileErrById } = await supabaseSimpelAdmin
            .from("profiles")
            .select("*")
            .eq("id", sessionUser.id)
            .maybeSingle();

          if (profileErrById) {
            console.error("[SSO] Gagal mengambil profil dari SIMPEL (by id):", profileErrById.message);
          }
          profile = profileById;
        }

        // 2. Ambil user_roles dari database SIMPEL
        let userRole = "employee"; // default role
        let userNip = null;
        
        // Coba ambil role menggunakan sessionUser.id (auth UUID) terlebih dahulu
        if (sessionUser?.id) {
          const { data: roleById, error: roleErrById } = await supabaseSimpelAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", sessionUser.id)
            .maybeSingle();

          if (roleErrById) {
            console.error("[SSO] Gagal mengambil role dari SIMPEL (by auth id):", roleErrById.message);
          } else if (roleById) {
            // Pemetaan role SIMPEL -> SiCuti
            if (roleById.role === "admin_pusat" || roleById.role === "admin_pimpinan" || roleById.role === "admin_super") {
              userRole = "master_admin";
            } else if (roleById.role === "admin_unit") {
              userRole = "admin_unit";
            }
            console.log("[SSO] Role ditemukan (by auth id):", roleById.role, "-> SiCuti role:", userRole);
          }
        }

        // Fallback: coba ambil role via profile.id jika belum ditemukan
        if (userRole === "employee" && profile) {
          const { data: roleData, error: roleErr } = await supabaseSimpelAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", profile.id)
            .maybeSingle();
          
          if (roleErr) {
            console.error("[SSO] Gagal mengambil role dari SIMPEL (by profile.id):", roleErr.message);
          } else if (roleData) {
            // Pemetaan role SIMPEL -> SiCuti
            if (roleData.role === "admin_pusat" || roleData.role === "admin_pimpinan" || roleData.role === "admin_super") {
              userRole = "master_admin";
            } else if (roleData.role === "admin_unit") {
              userRole = "admin_unit";
            }
            console.log("[SSO] Role ditemukan (by profile.id):", roleData.role, "-> SiCuti role:", userRole);
          }
        }

        // Fallback terakhir: cek user_metadata dari token JWT
        if (userRole === "employee" && sessionUser?.user_metadata?.role) {
          const metaRole = sessionUser.user_metadata.role;
          if (metaRole === "admin_pusat" || metaRole === "admin_pimpinan" || metaRole === "admin_super") {
            userRole = "master_admin";
          } else if (metaRole === "admin_unit") {
            userRole = "admin_unit";
          }
          console.log("[SSO] Role dari user_metadata:", metaRole, "-> SiCuti role:", userRole);
        }

        if (profile) {
          userNip = profile.nip || null;
        }

        // Jika NIP belum ada di profile, coba extract dari email (format: NIP@sipandai.local)
        if (!userNip && sessionUser?.email) {
          const emailPrefix = sessionUser.email.split("@")[0];
          if (/^\d+$/.test(emailPrefix)) {
            userNip = emailPrefix;
          }
        }

        // 3. Set default permissions berdasarkan role
        let permissions = [];
        if (userRole === "master_admin") {
          permissions = ["all"];
        } else if (userRole === "admin_unit") {
          permissions = ["dashboard", "employees_unit", "leave_requests_unit", "leave_history_unit", "surat_keterangan_unit"];
        } else {
          // Employee: hanya bisa akses data cuti mereka sendiri
          permissions = ["leave_requests_self", "leave_history_self"];
        }

        // Auto-Provisioning: jika user tidak terdaftar di database lokal SiCuti, registrasikan otomatis!
        if (!localUser) {
          console.log("[SSO] User belum terdaftar di SiCuti, memulai auto-provisioning untuk:", sessionUser?.email);
          
          const username = sessionUser?.email ? sessionUser.email.split("@")[0] : `user_${Date.now()}`;
          const newUser = {
            name: profile?.full_name || sessionUser?.email || "SSO User",
            username: username,
            password: "sso_managed_login", // Dummy password
            email: sessionUser?.email,
            role: userRole,
            unit_kerja: profile?.department || null,
            nip: userNip,
            status: "active",
            permissions: permissions,
            last_login: new Date().toISOString()
          };

          // 4. Masukkan user baru ke database SiCuti
          const { data: createdUser, error: createErr } = await supabaseData
            .from("users")
            .insert([newUser])
            .select()
            .single();

          if (createErr) {
            console.error("[SSO] Gagal auto-registrasi user baru di SiCuti:", createErr.message);
            navigate("/?error=auto_registration_failed", { replace: true });
            return;
          }

          finalUser = createdUser;
          console.log("[SSO] Auto-provisioning berhasil untuk:", finalUser.email, "role:", userRole, "nip:", userNip);
        } else {
          // User sudah ada, sinkronisasikan role, NIP, unit_kerja, dan permissions jika berubah
          const updates = {};
          let needsUpdate = false;

          if (localUser.role !== userRole) {
            updates.role = userRole;
            updates.permissions = permissions;
            needsUpdate = true;
            console.log(`[SSO] Update role dari ${localUser.role} ke ${userRole} di SiCuti`);
          }

          if (!localUser.nip && userNip) {
            updates.nip = userNip;
            needsUpdate = true;
            console.log(`[SSO] Update NIP ke ${userNip} di SiCuti`);
          }

          if (profile?.department && localUser.unit_kerja !== profile.department) {
            updates.unit_kerja = profile.department;
            needsUpdate = true;
            console.log(`[SSO] Update Unit Kerja ke ${profile.department} di SiCuti`);
          }

          // Juga pastikan permissions employee sudah benar jika rolenya tetap employee
          if (localUser.role === "employee" && !needsUpdate && 
              (!localUser.permissions || 
               (Array.isArray(localUser.permissions) && localUser.permissions.includes("dashboard") && localUser.permissions.length === 1))) {
            updates.permissions = ["leave_requests_self", "leave_history_self"];
            needsUpdate = true;
            console.log(`[SSO] Update permissions employee di SiCuti`);
          }

          if (needsUpdate) {
            // Selalu set last_login ketika di-update
            updates.last_login = new Date().toISOString();

            const { data: updated, error: updateErr } = await supabaseData
              .from("users")
              .update(updates)
              .eq("id", localUser.id)
              .select()
              .single();

            if (updateErr) {
              console.error("[SSO] Gagal update sinkronisasi data user SiCuti:", updateErr.message);
            } else {
              finalUser = updated;
              console.log("[SSO] User SiCuti berhasil disinkronkan dengan SIMPEL");
            }
          }
        }

        // Map database fields to frontend format
        const mappedUser = {
          ...finalUser,
          unitKerja: finalUser.unit_kerja || finalUser.unitKerja
        };

        // Simpan sesi ke AuthManager lokal SiCuti agar dikenali oleh seluruh aplikasi
        AuthManager.setUserSession(mappedUser);

        console.log("[SSO] Sesi lokal berhasil disinkronkan untuk:", mappedUser.name, "Role:", mappedUser.role);
        
        // Redirect berdasarkan role
        if (mappedUser.role === "employee") {
          navigate("/leave-requests", { replace: true });
        } else {
          navigate("/employees", { replace: true });
        }
      } catch (err) {
        console.error("[SSO] Error tidak terduga:", err);
        navigate("/", { replace: true });
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg font-medium">Mengautentikasi...</p>
        <p className="text-slate-400 text-sm mt-1">
          Menghubungkan sesi dari SIMPEL
        </p>
      </div>
    </div>
  );
};

export default AuthCallback;
