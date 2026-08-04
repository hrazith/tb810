import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const BUILDING_NAME = "TB810";
const STAGEADMIN_SQL = "legacy/sql/torrebal_stageadmin.sql";
const ADMINCONDO_SQL = "legacy/sql/torrebal_admincondo.sql";
const TRIAL_OWNER_ALLOWLIST = new Set([
  "70b6ef3d-5a99-4bd5-8a92-97e6775240e6",
  "21064bae-5dc9-4bf1-9dd2-84cbcdceadd3",
  "44daabc9-daa3-4f49-a14a-1e7ea9c17fc7",
]);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  return { write: argv.includes("--write") };
}

function parseOwnerRows(sqlPath) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const match = sql.match(
    /INSERT INTO `owners` \(`id`, `name`, `phone_number`, `email`, `active`, `code`, `comments`, `createdBy`, `modifiedBy`, `created_at`, `updated_at`, `deleted_at`\) VALUES\s*([\s\S]*?);/,
  );
  if (!match) return [];

  const block = match[1];
  const rows = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  const pushRow = (text) => {
    const values = [];
    let cell = "";
    let inCellString = false;
    let cellEscaped = false;
    for (const char of text) {
      if (cellEscaped) {
        cell += char;
        cellEscaped = false;
        continue;
      }
      if (char === "\\") {
        cell += char;
        cellEscaped = true;
        continue;
      }
      if (char === "'") {
        inCellString = !inCellString;
        continue;
      }
      if (char === "," && !inCellString) {
        values.push(cell.trim());
        cell = "";
        continue;
      }
      cell += char;
    }
    values.push(cell.trim());
    return values.map((value) => {
      if (value === "NULL") return null;
      return value.replace(/^'(.*)'$/, "$1").replace(/\\'/g, "'");
    });
  };

  for (const char of block) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "'") {
      inString = !inString;
      current += char;
      continue;
    }
    if (char === "(" && !inString) {
      depth += 1;
      if (depth === 1) {
        current = "";
        continue;
      }
    }
    if (char === ")" && !inString) {
      depth -= 1;
      if (depth === 0) {
        const values = pushRow(current);
        rows.push({
          legacy_owner_id: values[0],
          name: values[1],
          phone_number: values[2],
          email: values[3],
          active: values[4],
          code: values[5],
          comments: values[6],
        });
        current = "";
        continue;
      }
    }
    if (depth >= 1) current += char;
  }

  return rows;
}

function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

function buildOwnerPayload(row) {
  return {
    legacy_owner_code: normalizeText(row.code),
    full_name: normalizeText(row.name),
    phone_number: normalizeText(row.phone_number) || null,
    email: normalizeText(row.email) || null,
    active: String(row.active) === "1",
    legacy_table: "owners",
    legacy_id: normalizeText(row.code),
    legacy_metadata: {
      legacy_owner_id: normalizeText(row.legacy_owner_id),
      comments: normalizeText(row.comments) || null,
      source: path.basename(ADMINCONDO_SQL),
    },
  };
}

async function getPotentialTrialOwners(supabase) {
  const { data: owners, error } = await supabase
    .from("tb810_owners")
    .select("id, full_name, email, phone_number, legacy_owner_code")
    .order("created_at", { ascending: true });
  if (error) throw error;

  if (!owners || owners.length === 0) return [];

  const ownerIds = owners.map((owner) => owner.id);
  const ownershipsResult = await supabase
    .from("tb810_ownerships")
    .select("owner_id")
    .in("owner_id", ownerIds);
  if (ownershipsResult.error) throw ownershipsResult.error;

  const ownershipCountByOwner = new Map();
  for (const row of ownershipsResult.data ?? []) {
    ownershipCountByOwner.set(row.owner_id, (ownershipCountByOwner.get(row.owner_id) ?? 0) + 1);
  }

  return owners.map((owner) => ({
    id: owner.id,
    name: owner.full_name,
    email: owner.email,
    phone_number: owner.phone_number,
    legacy_owner_code: owner.legacy_owner_code,
    ownerships: ownershipCountByOwner.get(owner.id) ?? 0,
    unit_accounts: 0,
  }));
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  console.log("STEP 1");
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  console.log("STEP 2");

  const stageadminOwners = await Promise.resolve(parseOwnerRows(STAGEADMIN_SQL));
  const admincondoOwners = await Promise.resolve(parseOwnerRows(ADMINCONDO_SQL));
  console.log("STEP 3");

  let buildingResult;
  try {
    buildingResult = await supabase.from("tb810_buildings").select("id, name").eq("name", BUILDING_NAME).maybeSingle();
  } catch (e) {
    console.error("FAILED QUERY:", JSON.stringify(e, null, 2));
    throw e;
  }

  let currentOwnersResult;
  try {
    currentOwnersResult = await supabase.from("tb810_owners").select("id", { count: "exact", head: true });
  } catch (e) {
    console.error("FAILED QUERY:", JSON.stringify(e, null, 2));
    throw e;
  }

  if (buildingResult.error) throw buildingResult.error;
  if (!buildingResult.data) throw new Error("Current building not found.");
  if (currentOwnersResult.error) throw currentOwnersResult.error;
  console.log("STEP 4");

  const stageadminByCode = new Map(stageadminOwners.map((row) => [normalizeText(row.code), row]));
  const admincondoByCode = new Map(admincondoOwners.map((row) => [normalizeText(row.code), row]));
  const onlyAdmincondoCodes = [...admincondoByCode.keys()].filter((code) => !stageadminByCode.has(code)).sort();
  const duplicateLegacyCodes = [...new Set(admincondoOwners.map((row) => normalizeText(row.code)).filter((code, index, arr) => code && arr.indexOf(code) !== index))];
  const missingCodes = stageadminOwners.filter((row) => !admincondoByCode.has(normalizeText(row.code))).map((row) => normalizeText(row.code)).filter(Boolean);

  const currentOwners = await getPotentialTrialOwners(supabase);
  const allowlistedTrialOwners = currentOwners.filter((owner) => TRIAL_OWNER_ALLOWLIST.has(owner.id));
  const unclassifiedNullCodeOwners = currentOwners.filter(
    (owner) => owner.legacy_owner_code == null && !TRIAL_OWNER_ALLOWLIST.has(owner.id),
  );
  const confirmedTrialOwners = allowlistedTrialOwners.filter(
    (owner) => owner.ownerships === 0 && owner.unit_accounts === 0,
  );
  const referencedTrialOwners = allowlistedTrialOwners.filter(
    (owner) => owner.ownerships > 0 || owner.unit_accounts > 0,
  );

  const existingOwnersResult = await supabase
    .from("tb810_owners")
    .select("id, legacy_owner_code, full_name, phone_number, email, active")
    .not("legacy_owner_code", "is", null);
  if (existingOwnersResult.error) throw existingOwnersResult.error;
  console.log("STEP 5");
  const existingByCode = new Map((existingOwnersResult.data ?? []).map((row) => [normalizeText(row.legacy_owner_code), row]));

  const proposedInserts = [];
  const proposedUpdates = [];
  for (const row of admincondoOwners) {
    const payload = buildOwnerPayload(row);
    const existing = existingByCode.get(payload.legacy_owner_code);
    if (!existing) {
      proposedInserts.push(payload);
      continue;
    }
    const updates = {};
    if (payload.full_name && payload.full_name !== existing.full_name) updates.full_name = payload.full_name;
    if (payload.phone_number && payload.phone_number !== existing.phone_number) updates.phone_number = payload.phone_number;
    if (payload.email && payload.email !== existing.email) updates.email = payload.email;
    if (payload.active !== existing.active) updates.active = payload.active;
    if (Object.keys(updates).length > 0) {
      proposedUpdates.push({ legacy_owner_code: payload.legacy_owner_code, updates });
    }
  }

  const summary = {
    targetSupabaseProject: url,
    stageadminOwnerCount: stageadminOwners.length,
    legacyOwnerCount: admincondoOwners.length,
    currentTb810OwnersCount: currentOwnersResult.count ?? 0,
    proposedInserts: proposedInserts.length,
    proposedUpdates: proposedUpdates.length,
    duplicateLegacyCodes: duplicateLegacyCodes.length,
    missingCodes,
    ownersOnlyInAdmincondo: onlyAdmincondoCodes,
    ownerInspectionReport: currentOwners.map((owner) => ({
      id: owner.id,
      display_name: owner.name,
      legacy_owner_code: owner.legacy_owner_code,
      email: owner.email,
      phone: owner.phone_number,
      ownership_reference_count: owner.ownerships,
      unit_account_reference_count: owner.unit_accounts,
    })),
    trialOwners: allowlistedTrialOwners.map((owner) => ({
      id: owner.id,
      display_name: owner.name,
      email: owner.email,
      phone: owner.phone_number,
      ownership_reference_count: owner.ownerships,
      unit_account_reference_count: owner.unit_accounts,
    })),
    confirmedTrialOwnersProposedForDeletion: confirmedTrialOwners.map((owner) => owner.id),
    unclassifiedNullLegacyCodeOwnersPreserved: unclassifiedNullCodeOwners.map((owner) => ({
      id: owner.id,
      display_name: owner.name,
      email: owner.email,
      phone: owner.phone_number,
      ownership_reference_count: owner.ownerships,
      unit_account_reference_count: owner.unit_accounts,
    })),
    referencedTrialOwners: referencedTrialOwners.map((owner) => ({
      id: owner.id,
      display_name: owner.name,
      email: owner.email,
      phone: owner.phone_number,
      ownership_reference_count: owner.ownerships,
      unit_account_reference_count: owner.unit_accounts,
    })),
    writesOwnerData: true,
  };

  console.log("STEP 6");
  console.log("STEP 7");
  const inspectionReport = {
    currentTb810Owners: summary.ownerInspectionReport,
    trialOwnerCandidates: summary.trialOwners,
    proposedInserts: proposedInserts,
    proposedUpdates: proposedUpdates,
    duplicateCodes: duplicateLegacyCodes,
    missingCodes,
    ownersOnlyInAdmincondo: onlyAdmincondoCodes,
    confirmedTrialOwnersProposedForDeletion: confirmedTrialOwners.map((owner) => owner.id),
    unclassifiedNullLegacyCodeOwnersPreserved: unclassifiedNullCodeOwners.map((owner) => ({
      id: owner.id,
      display_name: owner.name,
      email: owner.email,
      phone: owner.phone_number,
      ownership_reference_count: owner.ownerships,
      unit_account_reference_count: owner.unit_accounts,
    })),
  };

  console.log("STEP 8");
  console.log("STEP 9");
  console.log("=== Inspection Report ===");
  console.log(JSON.stringify(inspectionReport, null, 2));

  if (!args.write) {
    console.log("Dry run only. Re-run with --write to remove unreferenced trial owners and import legacy owners.");
    return;
  }

  if (referencedTrialOwners.length > 0) {
    throw new Error("One or more allowlisted trial owners are still referenced; refusing to delete.");
  }

  let deletedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;

  if (confirmedTrialOwners.length > 0) {
    try {
      const { error: deleteError } = await supabase
        .from("tb810_owners")
        .delete()
        .in("id", confirmedTrialOwners.map((owner) => owner.id));
      if (deleteError) throw deleteError;
      deletedCount = confirmedTrialOwners.length;
    } catch (e) {
      console.error("FAILED QUERY:", JSON.stringify(e, null, 2));
      throw e;
    }
  }

  if (proposedInserts.length > 0) {
    try {
      const { error: upsertError } = await supabase
        .from("tb810_owners")
        .upsert(proposedInserts, { onConflict: "legacy_owner_code" });
      if (upsertError) throw upsertError;
      insertedCount = proposedInserts.length;
    } catch (e) {
      console.error("FAILED QUERY:", JSON.stringify(e, null, 2));
      throw e;
    }
  }

  for (const item of proposedUpdates) {
    try {
      const { error } = await supabase
        .from("tb810_owners")
        .update(item.updates)
        .eq("legacy_owner_code", item.legacy_owner_code);
      if (error) throw error;
      updatedCount += 1;
    } catch (e) {
      console.error("FAILED QUERY:", JSON.stringify(e, null, 2));
      throw e;
    }
  }

  console.log("=== Write Summary ===");
  console.log(
    JSON.stringify(
      {
        trialOwnersDeleted: deletedCount,
        legacyOwnersInserted: insertedCount,
        legacyOwnersUpdated: updatedCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(JSON.stringify(error, null, 2));
  }
  process.exit(1);
});
