import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const isApply = args.has("--apply");
const isDryRun = !isApply || args.has("--dry-run");
const allowUnmappedSkip = args.has("--allow-unmapped-skip");
const overrideArg = process.argv.find((arg) => arg.startsWith("--override-file="));
const overrideFile = overrideArg ? overrideArg.slice("--override-file=".length) : null;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.resolve("tmp", "employee-id-migration", timestamp);

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SIMPEL_URL",
  "SIMPEL_SERVICE_ROLE_KEY",
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Env belum lengkap: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const sicuti = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const simpel = createClient(
  process.env.SIMPEL_URL,
  process.env.SIMPEL_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function fetchAll(client, table, select, pageSize = 1000, options = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from(table)
      .select(select)
      .range(from, to);

    if (error) {
      if (options.optional && /does not exist|Could not find the table/i.test(error.message)) {
        console.warn(`${table}: tabel tidak ada, dilewati.`);
        return [];
      }
      throw new Error(`${table}: ${error.message}`);
    }

    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function normalizeNip(nip) {
  const value = nip == null ? "" : String(nip).trim();
  return value && value !== "null" ? value : "";
}

function groupBy(rows, keyFn) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function countChanged(mappings) {
  return mappings.filter((row) => row.local_id !== row.simpel_id).length;
}

function buildReferenceCounts(referenceGroups, employeeId) {
  return Object.fromEntries(
    Object.entries(referenceGroups).map(([table, rows]) => [
      table,
      rows.filter((row) => row.employee_id === employeeId).length,
    ]),
  );
}

function loadOverrides(file) {
  if (!file) return [];
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Override file tidak ditemukan: ${resolved}`);
  }

  const rows = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!Array.isArray(rows)) {
    throw new Error("Override file harus berupa JSON array.");
  }

  return rows
    .filter((row) => row?.local_id && row?.simpel_id && row?.nip)
    .map((row) => ({
      local_id: row.local_id,
      simpel_id: row.simpel_id,
      nip: String(row.nip).trim(),
      local_name: row.local_name || row.name || "",
      simpel_name: row.simpel_name || "",
      source: row.source || "manual_override",
    }));
}

async function main() {
  console.log(isApply ? "Mode: APPLY" : "Mode: DRY RUN");

  const [
    localEmployees,
    simpelEmployees,
    leaveRequests,
    leaveBalances,
    leaveDeferrals,
    proposalItems,
    profiles,
  ] = await Promise.all([
    fetchAll(sicuti, "employees", "id,nip,name,department,position_name,rank_group,asn_status"),
    fetchAll(simpel, "employees", "id,nip,name,department,position_name,rank_group,asn_status"),
    fetchAll(sicuti, "leave_requests", "id,employee_id"),
    fetchAll(sicuti, "leave_balances", "id,employee_id"),
    fetchAll(sicuti, "leave_deferrals", "id,employee_id"),
    fetchAll(sicuti, "leave_proposal_items", "id,employee_id"),
    fetchAll(sicuti, "profiles", "id,employee_id", 1000, { optional: true }),
  ]);

  const localByNip = groupBy(localEmployees, (employee) => normalizeNip(employee.nip));
  const simpelByNip = groupBy(simpelEmployees, (employee) => normalizeNip(employee.nip));
  const localById = new Map(localEmployees.map((employee) => [employee.id, employee]));

  const duplicateLocalNips = Array.from(localByNip.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([nip, rows]) => ({ nip, ids: rows.map((row) => row.id), names: rows.map((row) => row.name) }));

  const duplicateSimpelNips = Array.from(simpelByNip.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([nip, rows]) => ({ nip, ids: rows.map((row) => row.id), names: rows.map((row) => row.name) }));

  const referencedIds = new Set(
    [
      ...leaveRequests,
      ...leaveBalances,
      ...leaveDeferrals,
      ...proposalItems,
      ...profiles,
    ]
      .map((row) => row.employee_id)
      .filter(Boolean),
  );
  const referenceGroups = {
    leave_requests: leaveRequests,
    leave_balances: leaveBalances,
    leave_deferrals: leaveDeferrals,
    leave_proposal_items: proposalItems,
    profiles,
  };

  const mappings = [];
  const unmappedReferencedEmployees = [];
  const targetIdConflicts = [];
  const overrides = loadOverrides(overrideFile);
  const overrideByLocalId = new Map(overrides.map((row) => [row.local_id, row]));

  for (const local of localEmployees) {
    const override = overrideByLocalId.get(local.id);
    if (override) {
      mappings.push({
        ...override,
        local_name: override.local_name || local.name,
      });
      continue;
    }

    const nip = normalizeNip(local.nip);
    if (!nip) {
      if (referencedIds.has(local.id)) {
        unmappedReferencedEmployees.push({
          local_id: local.id,
          nip: local.nip,
          name: local.name,
          reference_counts: buildReferenceCounts(referenceGroups, local.id),
          reason: "NIP lokal kosong",
        });
      }
      continue;
    }

    const simpelMatches = simpelByNip.get(nip) || [];
    if (simpelMatches.length !== 1) {
      if (referencedIds.has(local.id)) {
        unmappedReferencedEmployees.push({
          local_id: local.id,
          nip,
          name: local.name,
          reference_counts: buildReferenceCounts(referenceGroups, local.id),
          reason: simpelMatches.length === 0 ? "NIP tidak ditemukan di SIMPEL" : "NIP duplikat di SIMPEL",
        });
      }
      continue;
    }

    const simpelEmployee = simpelMatches[0];
    const targetLocalRow = localById.get(simpelEmployee.id);
    if (
      targetLocalRow &&
      targetLocalRow.id !== local.id &&
      normalizeNip(targetLocalRow.nip) &&
      normalizeNip(targetLocalRow.nip) !== nip
    ) {
      targetIdConflicts.push({
        local_id: local.id,
        simpel_id: simpelEmployee.id,
        nip,
        name: local.name,
        reference_counts: buildReferenceCounts(referenceGroups, local.id),
        conflicting_local_nip: targetLocalRow.nip,
        conflicting_local_name: targetLocalRow.name,
        conflicting_reference_counts: buildReferenceCounts(referenceGroups, targetLocalRow.id),
      });
      continue;
    }

    mappings.push({
      local_id: local.id,
      simpel_id: simpelEmployee.id,
      nip,
      local_name: local.name,
      simpel_name: simpelEmployee.name,
    });
  }

  const blockingIssues = [
    ...duplicateLocalNips.map((issue) => ({ type: "duplicate_local_nip", ...issue })),
    ...duplicateSimpelNips.map((issue) => ({ type: "duplicate_simpel_nip", ...issue })),
    ...targetIdConflicts.map((issue) => ({ type: "target_id_conflict", ...issue })),
    ...unmappedReferencedEmployees.map((issue) => ({ type: "unmapped_referenced_employee", ...issue })),
  ];

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "mapping.json"), JSON.stringify(mappings, null, 2));
  fs.writeFileSync(path.join(outputDir, "blocking-issues.json"), JSON.stringify(blockingIssues, null, 2));
  fs.writeFileSync(path.join(outputDir, "local-employees-backup.json"), JSON.stringify(localEmployees, null, 2));

  console.log(`Pegawai lokal: ${localEmployees.length}`);
  console.log(`Pegawai SIMPEL: ${simpelEmployees.length}`);
  console.log(`Mapping NIP valid: ${mappings.length}`);
  console.log(`Manual override: ${overrides.length}`);
  console.log(`ID yang akan berubah: ${countChanged(mappings)}`);
  console.log(`Masalah pemblokir: ${blockingIssues.length}`);
  console.log(`Output audit: ${outputDir}`);

  const fatalIssues = allowUnmappedSkip
    ? blockingIssues.filter((issue) => !["unmapped_referenced_employee"].includes(issue.type))
    : blockingIssues;

  if (blockingIssues.length > 0) {
    console.log(`Isu yang akan di-skip: ${blockingIssues.length - fatalIssues.length}`);
  }

  if (fatalIssues.length > 0) {
    fs.writeFileSync(path.join(outputDir, "fatal-issues.json"), JSON.stringify(fatalIssues, null, 2));
    console.error("Migrasi dibatalkan. Lihat fatal-issues.json.");
    process.exit(1);
  }

  if (isDryRun && !isApply) {
    console.log("Dry-run selesai. Jalankan ulang dengan --apply setelah migration SQL sudah terpasang.");
    return;
  }

  const rpcPayload = mappings.map(({ local_id, simpel_id, nip }) => ({
    local_id,
    simpel_id,
    nip,
  }));

  const { data, error } = await sicuti.rpc("migrate_employee_ids_to_simpel", {
    p_mappings: rpcPayload,
    p_notes: `Migrasi employee_id lokal ke ID SIMPEL via script ${timestamp}`,
  });

  if (error) {
    throw new Error(`RPC migrate_employee_ids_to_simpel gagal: ${error.message}`);
  }

  fs.writeFileSync(path.join(outputDir, "apply-result.json"), JSON.stringify(data, null, 2));

  console.log("Migrasi berhasil.");
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
