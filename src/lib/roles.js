/**
 * roles.js — Sistem role SiCuti yang menginduk ke SIMPEL
 *
 * Role SIMPEL → SiCuti (sama persis, tidak ada konversi):
 *   admin_pusat    → lihat semua data + bisa edit
 *   admin_pimpinan → lihat semua data + READ-ONLY (tidak bisa edit/hapus)
 *   admin_unit     → lihat data unit sendiri + bisa edit
 *   employee       → lihat data diri sendiri saja
 */

export const ROLES = {
  ADMIN_PUSAT:    "admin_pusat",
  ADMIN_PIMPINAN: "admin_pimpinan",
  ADMIN_UNIT:     "admin_unit",
  EMPLOYEE:       "employee",
};

export const ROLE_LABELS = {
  admin_pusat:    "Admin Pusat",
  admin_pimpinan: "Admin Pimpinan",
  admin_unit:     "Admin Unit",
  employee:       "Pegawai",
};

/** Role yang boleh melihat SEMUA data (lintas unit) */
export const canViewAll = (role) =>
  role === ROLES.ADMIN_PUSAT || role === ROLES.ADMIN_PIMPINAN;

/** Role yang boleh melakukan aksi tulis (tambah/edit/hapus) */
export const canEdit = (role) =>
  role === ROLES.ADMIN_PUSAT || role === ROLES.ADMIN_UNIT;

/** Role yang hanya boleh membaca, tidak boleh edit */
export const isReadOnly = (role) =>
  role === ROLES.ADMIN_PIMPINAN;

/** Apakah role ini tergolong admin level atas */
export const isHighAdmin = (role) =>
  role === ROLES.ADMIN_PUSAT || role === ROLES.ADMIN_PIMPINAN;

/** Default permissions berdasarkan role */
export const getPermissionsForRole = (role) => {
  switch (role) {
    case ROLES.ADMIN_PUSAT:
      return ["all"];
    case ROLES.ADMIN_PIMPINAN:
      return ["all_readonly"];
    case ROLES.ADMIN_UNIT:
      return [
        "dashboard",
        "employees_unit",
        "leave_requests_unit",
        "leave_history_unit",
        "surat_keterangan_unit",
      ];
    case ROLES.EMPLOYEE:
    default:
      return ["leave_requests_self", "leave_history_self"];
  }
};

/** Role hierarchy untuk hasRole() check */
export const ROLE_HIERARCHY = {
  employee:       1,
  admin_unit:     2,
  admin_pimpinan: 3,
  admin_pusat:    4,
};