import { supabase } from "@/lib/supabaseClient";
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { canEdit as roleCanEdit, isReadOnly as roleIsReadOnly } from "@/lib/roles";

/** UUID sentinel — query yang harus mengembalikan nol baris */
export const NO_EMPLOYEE_MATCH_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Terapkan filter scope ke query SIMPEL employees (chainable builder).
 * - employee       → hanya diri sendiri (NIP / ID)
 * - admin_unit     → department = unit user
 * - admin_pusat / admin_pimpinan → semua pegawai
 */
export function applyEmployeeScopeFilter(query, user) {
  if (!user) {
    return query.eq("id", NO_EMPLOYEE_MATCH_ID);
  }

  if (user.role === "employee") {
    const nip = user.nip ? String(user.nip).trim() : null;
    if (nip) return query.eq("nip", nip);
    if (user.employee_id) return query.eq("id", user.employee_id);
    if (user.id) return query.eq("id", user.id);
    return query.eq("id", NO_EMPLOYEE_MATCH_ID);
  }

  if (user.role === "admin_unit" && user.department) {
    return query.eq("department", user.department);
  }

  return query;
}

/** Cek apakah user boleh mengakses record pegawai tertentu */
export function canAccessEmployee(user, employee) {
  if (!user || !employee) return false;

  if (user.role === "admin_pusat" || user.role === "admin_pimpinan") {
    return true;
  }

  if (user.role === "admin_unit") {
    return !!user.department && employee.department === user.department;
  }

  if (user.role === "employee") {
    const userNip = user.nip ? String(user.nip).trim() : null;
    const empNip = employee.nip ? String(employee.nip).trim() : null;
    if (userNip && empNip && userNip === empNip) return true;
    if (user.employee_id && employee.id === user.employee_id) return true;
    if (user.id && employee.id === user.id) return true;
  }

  return false;
}

export function canEditLeaveData(user) {
  return roleCanEdit(user?.role);
}

export function isLeaveDataReadOnly(user) {
  return roleIsReadOnly(user?.role);
}

/**
 * Ambil ID pegawai di DB SiCuti (bukan SIMPEL) sesuai scope role.
 * null = akses semua pegawai (admin pusat / pimpinan).
 */
export async function getScopedSicutiEmployeeIds(user) {
  if (!user) return [];

  if (user.role === "admin_pusat" || user.role === "admin_pimpinan") {
    return null;
  }

  if (user.role === "employee") {
    const nip = user.nip ? String(user.nip).trim() : null;
    if (!nip) return [];
    const { data } = await supabase
      .from("employees")
      .select("id")
      .eq("nip", nip)
      .maybeSingle();
    return data?.id ? [data.id] : [];
  }

  if (user.role === "admin_unit" && user.department) {
    const { data: simpelEmps, error } = await supabaseSimpelAdmin
      .from("employees")
      .select("nip")
      .eq("department", user.department);

    if (error) throw error;

    const nips = (simpelEmps || [])
      .map((e) => (e.nip ? String(e.nip).trim() : null))
      .filter(Boolean);

    if (nips.length === 0) return [];

    const { data: localEmps, error: localErr } = await supabase
      .from("employees")
      .select("id")
      .in("nip", nips);

    if (localErr) throw localErr;
    return (localEmps || []).map((e) => e.id);
  }

  return [];
}

/** Terapkan filter employee_id pada query leave_requests / leave_balances (DB SiCuti) */
export function applySicutiEmployeeIdFilter(query, sicutiEmployeeIds) {
  if (sicutiEmployeeIds === null) return query;
  if (sicutiEmployeeIds.length === 0) {
    return query.eq("employee_id", NO_EMPLOYEE_MATCH_ID);
  }
  if (sicutiEmployeeIds.length === 1) {
    return query.eq("employee_id", sicutiEmployeeIds[0]);
  }
  return query.in("employee_id", sicutiEmployeeIds);
}

/** Validasi pegawai dari SIMPEL sebelum simpan data cuti */
export async function assertCanAccessEmployeeById(user, employeeId) {
  if (!employeeId) {
    throw new Error("Pegawai wajib dipilih.");
  }

  const { data: employee, error } = await supabaseSimpelAdmin
    .from("employees")
    .select("id, nip, name, department")
    .eq("id", employeeId)
    .maybeSingle();

  if (error) throw error;
  if (!employee) {
    throw new Error("Data pegawai tidak ditemukan.");
  }
  if (!canAccessEmployee(user, employee)) {
    throw new Error("Anda tidak memiliki izin untuk mengelola data cuti pegawai ini.");
  }

  return employee;
}
