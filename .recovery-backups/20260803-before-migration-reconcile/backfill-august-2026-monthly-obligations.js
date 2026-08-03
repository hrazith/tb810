import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const args = {
    apply: false,
    unitAccountId: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--apply") {
      args.apply = true;
      continue;
    }
    if (value === "--unit-account-id") {
      args.unitAccountId = argv[++i] ?? null;
    }
  }

  return args;
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  loadEnvFile(path.resolve(process.cwd(), ".env"));
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: building, error: buildingError } = await supabase
    .from("tb810_buildings")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (buildingError) throw buildingError;
  if (!building) throw new Error("Canonical building not found.");

  const { data: period, error: periodError } = await supabase
    .from("tb810_billing_periods")
    .select("id, period_year, period_month")
    .eq("building_id", building.id)
    .eq("period_year", 2026)
    .eq("period_month", 8)
    .maybeSingle();

  if (periodError) throw periodError;
  if (!period) throw new Error("August 2026 billing period not found.");

  const payload = {
    p_building_id: building.id,
    p_billing_period_id: period.id,
    p_snapshot_effective_at: "2026-08-01T05:00:00Z",
    p_unit_account_id: args.unitAccountId,
  };

  console.log(JSON.stringify({ apply: args.apply, payload }, null, 2));

  if (!args.apply) {
    return;
  }

  const { data, error } = await supabase.rpc("tb810_generate_monthly_obligations", payload);
  if (error) throw error;

  console.log(JSON.stringify({ generated: data ?? [] }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
