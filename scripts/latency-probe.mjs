import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = new URL("../.env.local", import.meta.url);
const envText = fs.readFileSync(envPath, "utf8");
for (const line of envText.split(/\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (!match) continue;
  const [, key, rawValue] = match;
  if (!process.env[key]) {
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  throw new Error("Missing Supabase env vars in .env.local.");
}

const TABLES = {
  buildingId: "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810",
  unitNumber: "201",
  month: "2026-07",
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function measure(label, fn, samples = 10) {
  const results = [];
  for (let i = 0; i < samples; i += 1) {
    const started = Date.now();
    await fn();
    results.push(Date.now() - started);
  }
  return {
    label,
    samples: results,
    min: Math.min(...results),
    max: Math.max(...results),
    mean: results.reduce((sum, value) => sum + value, 0) / results.length,
    median: median(results),
    p95: percentile(results, 95),
  };
}

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bootstrapUnit = await supabase
  .from("tb810_units")
  .select("id")
  .eq("building_id", TABLES.buildingId)
  .eq("unit_number", TABLES.unitNumber)
  .maybeSingle();

if (bootstrapUnit.error) {
  throw new Error(bootstrapUnit.error.message);
}
if (!bootstrapUnit.data) {
  throw new Error("Unit 201 was not found.");
}

const unitId = bootstrapUnit.data.id;

const clientConstructMs = [];
for (let i = 0; i < 10; i += 1) {
  const started = Date.now();
  createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  clientConstructMs.push(Date.now() - started);
}

const probes = [
  await measure("primary_key_unit", async () => {
    const { error } = await supabase
      .from("tb810_units")
      .select("id, unit_number")
      .eq("id", unitId)
      .maybeSingle();
    if (error) throw error;
  }),
  await measure("tiny_indexed", async () => {
    const { error } = await supabase
      .from("tb810_utility_types")
      .select("id, code")
      .eq("code", "common_water")
      .maybeSingle();
    if (error) throw error;
  }),
  await measure("unit201_ownership", async () => {
    const { error } = await supabase
      .from("tb810_ownerships")
      .select("id, owner_id, unit_id")
      .eq("unit_id", unitId)
      .order("start_date", { ascending: false });
    if (error) throw error;
  }),
];

console.log(
  JSON.stringify(
    {
      client_construct_ms: {
        min: Math.min(...clientConstructMs),
        max: Math.max(...clientConstructMs),
        mean: clientConstructMs.reduce((sum, value) => sum + value, 0) / clientConstructMs.length,
        median: median(clientConstructMs),
      },
      probes: probes.map((probe) => ({
        label: probe.label,
        samples: probe.samples,
        min: probe.min,
        max: probe.max,
        mean: probe.mean,
        median: probe.median,
        p95: probe.p95,
      })),
    },
    null,
    2,
  ),
);
