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

function getTokenExpirySeconds(token) {
  const [, payload] = String(token || "").split(".");
  if (!payload) return 0;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return typeof decoded.exp === "number" ? decoded.exp : 0;
  } catch {
    return 0;
  }
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
  return payload; // { access_token, refresh_token, user_id }
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

  if (!simpelServiceKey) return { profile: null, role: "employee", nip: extractNip(email, null), employeeId: null, simpelEmployee: null };

  const admin = createClient(simpelUrl, simpelServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: profile }, { data: roleRow }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);

  const nip = extractNip(email, profile?.nip);
  let employeeId = null;
  let simpelEmployee = null;

  if (nip) {
    const { data: emp } = await admin.from("employees").select("id, nip, name, department, position_name, rank_group").eq("nip", nip).maybeSingle();
    simpelEmployee = emp;
    employeeId = emp?.id ?? null;
  }
  if (!employeeId) {
    const { data: emp } = await admin.from("employees").select("id, nip, name, department, position_name, rank_group").eq("id", userId).maybeSingle();
    simpelEmployee = emp;
    employeeId = emp?.id ?? null;
  }

  return {
    profile,
    role: roleRow?.role || "employee",
    nip,
    employeeId,
    simpelEmployee,
  };
}

/**
 * Upsert pegawai ke DB SiCuti (by NIP) dan gunakan ID EMPLOYEE DARI SIMPEL (agar foreign key work).
 */
async function ensureLocalEmployeeId(sicutiAdmin, nip, profile, simpelEmployee, department, simpelEmployeeId) {
  if (!simpelEmployeeId && !nip) return null;

  const row = {
    id: simpelEmployeeId, // PENTING: Gunakan ID dari SIMPEL agar foreign key di leave_balances dll bekerja!
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
    console.error("[ensureLocalEmployeeId] error upserting employee:", error);
    // Jika gagal upsert, coba cari employee yang sudah ada dengan nip atau id
    const { data: existing } = await sicutiAdmin
      .from("employees")
      .select("id")
      .or(`nip.eq.${row.nip},id.eq.${simpelEmployeeId}`)
      .maybeSingle();
    return existing?.id ?? simpelEmployeeId;
  }

  return data?.id ?? simpelEmployeeId;
}

/**
 * SSO exchange — kembalikan data user + token SIMPEL langsung.
 * SiCuti menggunakan AuthManager (localStorage), bukan Supabase Auth SiCuti.
 * Tidak perlu provision/create user di Supabase SiCuti.
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
  const { profile, role, nip, employeeId, simpelEmployee } = await enrichUserFromSimpel(
    simpelUser.id,
    simpelUser.email,
  );

  const meta = simpelUser.user_metadata || {};
  const department = profile?.department || meta.department || "Belum Ditetapkan";

  let localEmployeeId = null;
  const sicutiUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sicutiServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (sicutiUrl && sicutiServiceKey) {
    const sicutiAdmin = createClient(sicutiUrl, sicutiServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    localEmployeeId = await ensureLocalEmployeeId(
      sicutiAdmin,
      nip,
      profile,
      simpelEmployee,
      department,
      employeeId, // PENTING: Kirim ID employee dari SIMPEL
    );
  }

  return {
    user: {
      id:          simpelUser.id,
      email:       simpelUser.email,
      name:        profile?.full_name || meta.full_name || simpelUser.email,
      role,
      department:  department,
      nip,
      employee_id: localEmployeeId,
      permissions: permissionsForRole(role),
    },
    // Kembalikan token SIMPEL — AuthCallback di SiCuti akan simpan ke AuthManager
    session: {
      access_token:  simpelAccessToken,
      refresh_token: simpelRefreshToken,
      expires_at:    getTokenExpirySeconds(simpelAccessToken),
    },
    provider: "simpel",
  };
}
