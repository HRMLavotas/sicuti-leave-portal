import { supabase } from "@/lib/supabaseClient";

const CHUNK_SIZE = 50;

/**
 * Upsert pegawai SIMPEL ke tabel employees SiCuti dengan ID SIMPEL sebagai primary key.
 * Setelah migrasi data, employees.id di SiCuti harus sama dengan employees.id di SIMPEL.
 */
export async function resolveSicutiEmployeeIds(simpelEmployees) {
  if (!simpelEmployees?.length) {
    return new Map();
  }

  const nipMap = new Map();
  for (const emp of simpelEmployees) {
    const nip = emp.nip ? String(emp.nip).trim() : null;
    if (!nip || nip === "null") continue;
    nipMap.set(nip, emp);
  }

  if (nipMap.size === 0) {
    return new Map();
  }

  const formattedEmployees = Array.from(nipMap.entries())
    .filter(([, emp]) => emp.id)
    .map(([nip, emp]) => ({
      id: emp.id,
      nip,
      name: emp.name,
      old_position: emp.old_position || null,
      department: emp.department || null,
      join_date: emp.join_date || null,
      position_type: emp.position_type || null,
      position_name: emp.position_name || null,
      asn_status: emp.asn_status || null,
      rank_group: emp.rank_group || null,
      updated_at: new Date().toISOString(),
    }));

  for (let i = 0; i < formattedEmployees.length; i += CHUNK_SIZE) {
    const chunk = formattedEmployees.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from("employees")
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: false });

    if (error) {
      console.warn("[sicutiEmployeeResolver] Upsert by SIMPEL id error:", error.message);
    }
  }

  const nips = Array.from(nipMap.keys());
  const simpelIds = Array.from(nipMap.values())
    .map((emp) => emp.id)
    .filter(Boolean);
  const nipToSicutiId = new Map();

  for (let i = 0; i < simpelIds.length; i += CHUNK_SIZE) {
    const chunk = simpelIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from("employees")
      .select("id, nip")
      .in("id", chunk);

    if (error) {
      console.warn("[sicutiEmployeeResolver] Lookup by SIMPEL id error:", error.message);
      continue;
    }

    for (const row of data || []) {
      if (row.nip && row.id) {
        nipToSicutiId.set(String(row.nip).trim(), row.id);
      }
    }
  }

  // Fallback transisi: row yang memang tidak ada di SIMPEL tetap bisa ditemukan lewat NIP.
  const unresolvedNips = nips.filter((nip) => !nipToSicutiId.has(nip));
  for (let i = 0; i < unresolvedNips.length; i += CHUNK_SIZE) {
    const chunk = unresolvedNips.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from("employees")
      .select("id, nip")
      .in("nip", chunk);

    if (error) {
      console.warn("[sicutiEmployeeResolver] Fallback lookup by NIP error:", error.message);
      continue;
    }

    for (const row of data || []) {
      const nip = row.nip ? String(row.nip).trim() : null;
      if (nip && row.id && !nipToSicutiId.has(nip)) {
        nipToSicutiId.set(nip, row.id);
      }
    }
  }

  return nipToSicutiId;
}

/**
 * Gabungkan data tampilan SIMPEL dengan employee_id SiCuti untuk operasi DB.
 */
export function attachSicutiEmployeeIds(simpelEmployees, nipToSicutiId) {
  return (simpelEmployees || [])
    .map((emp) => {
      const nip = emp.nip ? String(emp.nip).trim() : null;
      const sicutiEmployeeId = nip ? nipToSicutiId.get(nip) : null;
      if (!sicutiEmployeeId) return null;

      return {
        ...emp,
        simpelId: emp.id,
        sicutiEmployeeId,
        id: sicutiEmployeeId,
      };
    })
    .filter(Boolean);
}
