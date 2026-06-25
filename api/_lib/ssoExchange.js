import { createClient } from "@supabase/supabase-js";

function permissionsForRole(role) {
  if (role === "admin_pusat") return ["all"];
  if (role === "admin_pimpinan") return ["all_readonly"];
  if (role === "admin_unit") {
    return [
      "dashboard",
      "employees_unit",
      "leave_requests_unit",
      "leave_history_unit",
      "surat_keterangan_unit",
    ];
  }
  return ["leave_requests_self", "leave_history_self"];
}

function extractNip(email, profileNip) {
  if (profileNip) return profileNip;
  const match = email.match(/^(.+)@sipandai\.local$/i);
  return match ? match[1] : null;
}

async function redeemCode(code) {
  const simpelUrl = process.env.SIMPEL_URL;
  const sharedSecret = process.env.SSO_SHARED_SECRET;

  if (!simpelUrl || !sharedSecret) {
    throw new Error("SIMPEL_URL dan SSO_SHARED_SECRET wajib di environment server");
  }

  const res = await fetch(`${simpelUrl}/functions/v1/sso-redeem-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SSO-Secret": sharedSecret,
    },
    body: JSON.stringify({ code }),
  });

  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Gagal menukar authorization code");
  return payload;
}

async function getSimpelUser(accessToken) {
  const simpelUrl = process.env.SIMPEL_URL;
  const simpelAnonKey = process.env.SIMPEL_ANON_KEY;

  if (!simpelUrl || !simpelAnonKey) {
    throw new Error("SIMPEL_URL dan SIMPEL_ANON_KEY wajib di environment server");
  }

  const client = createClient(simpelUrl, simpelAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Token SIMPEL tidak valid atau kadaluarsa");
  return data.user;
}

async function enrichUserFromSimpel(userId, email) {
  const simpelUrl = process.env.SIMPEL_URL;
  const simpelServiceKey = process.env.SIMPEL_SERVICE_ROLE_KEY;

  if (!simpelServiceKey) {
    return { profile: null, role: "employee", nip: extractNip(email, null), simpelEmployee: null };
  }

  const admin = createClient(simpelUrl, simpelServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: profile }, { data: roleRow }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);

  const nip = extractNip(email, profile?.nip);
  let simpelEmployee = null;

  if (nip) {
    const { data: emp } = await admin
      .from("employees")
      .select("id, nip, name, department, position_name, rank_group")
      .eq("nip", nip)
      .maybeSingle();
    simpelEmployee = emp;
  }
  if (!simpelEmployee) {
    const { data: emp } = await admin
      .from("employees")
      .select("id, nip, name, department, position_name, rank_group")
      .eq("id", userId)
      .maybeSingle();
    simpelEmployee = emp;
  }

  return {
    profile,
    role: roleRow?.role || "employee",
    nip,
    simpelEmployee,
  };
}

/**
 * Upsert pegawai ke DB SiCuti (by NIP) dan kembalikan ID lokal untuk RLS leave_requests.
 */
async function ensureLocalEmployeeId(sicutiAdmin, nip, profile, simpelEmployee, department) {
  if (!nip) return null;

  const row = {
    nip: String(nip).trim(),
    name: simpelEmployee?.name || profile?.full_name || "Pegawai",
    department: simpelEmployee?.department || profile?.department || department || null,
    position_name: simpelEmployee?.position_name || profile?.position_name || null,
    rank_group: simpelEmployee?.rank_group || profile?.rank_group || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sicutiAdmin
    .from("employees")
    .upsert(row, { onConflict: "nip" })
    .select("id")
    .single();

  if (error) {
    const { data: existing } = await sicutiAdmin
      .from("employees")
      .select("id")
      .eq("nip", row.nip)
      .maybeSingle();
    return existing?.id ?? null;
  }

  return data?.id ?? null;
}

async function provisionSicutiUser(user) {
  const sicutiUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sicutiServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sicutiUrl || !sicutiServiceKey) {
    throw new Error(
      "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di environment server (Vercel)",
    );
  }

  const sicutiAdmin = createClient(sicutiUrl, sicutiServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const metadata = {
    full_name: user.name,
    department: user.department,
    role: user.role,
    nip: user.nip,
    employee_id: user.employee_id,
    sso_provider: "simpel",
    permissions: user.permissions,
  };

  const { data: existing } = await sicutiAdmin.auth.admin.getUserById(user.id);

  if (!existing?.user) {
    const { error: createError } = await sicutiAdmin.auth.admin.createUser({
      id: user.id,
      email: user.email,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { provider: "sso", providers: ["sso"] },
    });
    if (createError) throw createError;
  } else {
    const { error: updateError } = await sicutiAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: metadata,
    });
    if (updateError) throw updateError;
  }

  try {
    const { data: sessionData, error: createSessionError } =
      await sicutiAdmin.auth.admin.createSession({ user_id: user.id });

    if (!createSessionError && sessionData.session) {
      return {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_at: sessionData.session.expires_at ?? 0,
      };
    }
  } catch {
    // fallback magic link
  }

  const { data: linkData, error: linkError } = await sicutiAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error("Gagal membuat session SiCuti");
  }

  const { data: sessionData, error: sessionError } = await sicutiAdmin.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (sessionError || !sessionData.session) {
    throw new Error("Gagal verifikasi session SiCuti");
  }

  return {
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    expires_at: sessionData.session.expires_at ?? 0,
  };
}

/**
 * SSO exchange — provision user SiCuti + session RLS + token SIMPEL untuk query pegawai.
 */
export async function exchangeSsoCredentials(body) {
  const { code, access_token, refresh_token } = body ?? {};

  let simpelAccessToken = access_token;
  let simpelRefreshToken = refresh_token || "";

  if (code) {
    const redeemed = await redeemCode(code);
    simpelAccessToken = redeemed.access_token;
    simpelRefreshToken = redeemed.refresh_token || "";
  }

  if (!simpelAccessToken) {
    throw new Error("Authorization code atau access_token wajib");
  }

  const simpelUser = await getSimpelUser(simpelAccessToken);
  const { profile, role, nip, simpelEmployee } = await enrichUserFromSimpel(
    simpelUser.id,
    simpelUser.email,
  );

  const meta = simpelUser.user_metadata || {};
  const department = profile?.department || meta.department || "Belum Ditetapkan";

  const sicutiUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sicutiServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sicutiAdmin = createClient(sicutiUrl, sicutiServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const localEmployeeId = await ensureLocalEmployeeId(
    sicutiAdmin,
    nip,
    profile,
    simpelEmployee,
    department,
  );

  const ssoUser = {
    id: simpelUser.id,
    email: simpelUser.email,
    name: profile?.full_name || meta.full_name || simpelUser.email,
    role,
    department,
    nip,
    employee_id: localEmployeeId,
    permissions: permissionsForRole(role),
  };

  const session = await provisionSicutiUser(ssoUser);

  return {
    user: ssoUser,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    },
    simpel_session: {
      access_token: simpelAccessToken,
      refresh_token: simpelRefreshToken,
    },
    provider: "simpel",
  };
}
