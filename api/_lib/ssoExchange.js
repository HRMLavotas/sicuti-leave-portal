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
    throw new Error(
      "Authorization code membutuhkan SSO_SHARED_SECRET. Gunakan login ulang dari SIPANDAI atau set env di Vercel.",
    );
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
  if (!res.ok) {
    throw new Error(payload.error || "Gagal menukar authorization code");
  }
  return payload;
}

async function validateSimpelToken(accessToken) {
  const simpelUrl = process.env.SIMPEL_URL;
  const simpelAnonKey = process.env.SIMPEL_ANON_KEY;

  if (!simpelUrl || !simpelAnonKey) {
    throw new Error("SIMPEL_URL dan SIMPEL_ANON_KEY wajib di environment server");
  }

  const simpelClient = createClient(simpelUrl, simpelAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await simpelClient.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Token SIMPEL tidak valid atau sudah kadaluarsa");
  }
  return data.user;
}

async function enrichUserFromSimpel(userId, email) {
  const simpelUrl = process.env.SIMPEL_URL;
  const simpelServiceKey = process.env.SIMPEL_SERVICE_ROLE_KEY;

  const simpelAdmin = createClient(simpelUrl, simpelServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: profile }, { data: roleRow }] = await Promise.all([
    simpelAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    simpelAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);

  const nip = extractNip(email, profile?.nip);
  let employeeId = null;

  if (nip) {
    const { data: emp } = await simpelAdmin
      .from("employees")
      .select("id")
      .eq("nip", nip)
      .maybeSingle();
    employeeId = emp?.id ?? null;
  }
  if (!employeeId) {
    const { data: emp } = await simpelAdmin
      .from("employees")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    employeeId = emp?.id ?? null;
  }

  return {
    profile,
    role: roleRow?.role || "employee",
    nip,
    employeeId,
  };
}

async function provisionSicutiUser(user) {
  const sicutiUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sicutiServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sicutiUrl || !sicutiServiceKey) {
    throw new Error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di environment server");
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

  // Supabase menolak domain .local — konversi ke domain yang valid
  const sicutiEmail = user.email.endsWith("@sipandai.local")
    ? user.email.replace("@sipandai.local", "@sso.sipandai.site")
    : user.email;

  if (!existing?.user) {
    const { error: createError } = await sicutiAdmin.auth.admin.createUser({
      id: user.id,
      email: sicutiEmail,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { provider: "sso", providers: ["sso"] },
    });
    if (createError) throw createError;
  } else {
    const { error: updateError } = await sicutiAdmin.auth.admin.updateUserById(
      user.id,
      { user_metadata: metadata },
    );
    if (updateError) throw updateError;
  }

  try {
    const { data: sessionData, error: createSessionError } =
      await sicutiAdmin.auth.admin.createSession({ user_id: user.id });

    if (!createSessionError && sessionData?.session) {
      return sessionData.session;
    }
  } catch {
    // fallback below
  }

  const { data: linkData, error: linkError } =
    await sicutiAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: sicutiEmail,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error("Gagal membuat session SiCuti");
  }

  const { data: sessionData, error: sessionError } =
    await sicutiAdmin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "email",
    });

  if (sessionError || !sessionData?.session) {
    throw new Error("Gagal verifikasi session SiCuti");
  }

  return sessionData.session;
}

/**
 * Core SSO exchange — dipakai Vercel API route (same-origin, no CORS)
 */
export async function exchangeSsoCredentials(body) {
  const { code, access_token } = body ?? {};

  let simpelAccessToken = access_token;

  if (code) {
    const redeemed = await redeemCode(code);
    simpelAccessToken = redeemed.access_token;
  }

  if (!simpelAccessToken) {
    throw new Error("Authorization code atau access_token wajib");
  }

  const simpelUser = await validateSimpelToken(simpelAccessToken);
  const { profile, role, nip, employeeId } = await enrichUserFromSimpel(
    simpelUser.id,
    simpelUser.email,
  );

  const ssoUser = {
    id: simpelUser.id,
    email: simpelUser.email,
    name: profile?.full_name || simpelUser.user_metadata?.full_name || simpelUser.email,
    role,
    department: profile?.department || "Belum Ditetapkan",
    nip,
    employee_id: employeeId,
    permissions: permissionsForRole(role),
  };

  const session = await provisionSicutiUser(ssoUser);

  return {
    user: ssoUser,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? 0,
    },
    provider: "simpel",
  };
}
