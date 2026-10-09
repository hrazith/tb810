import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationsDir = path.join(process.cwd(), "supabase/migrations");
const LOCKDOWN = "20261009120000_api_surface_lockdown.sql";
const lockdown = readFileSync(path.join(migrationsDir, LOCKDOWN), "utf8");
const laterMigrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql") && file > LOCKDOWN)
  .map((file) => [file, readFileSync(path.join(migrationsDir, file), "utf8")]);

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Unguarded SECURITY DEFINER reads/writes: no PUBLIC or anon execution.
const anonDenied = [
  ["tb810_get_building_month_financial_facts", "uuid, integer, date"],
  ["tb810_get_unit_ownership_account_snapshot", "uuid"],
  ["tb810_get_unit_workspace_month_facts", "uuid, uuid, integer, date"],
  ["tb810_list_meter_reading_months", "uuid"],
  ["tb810_get_giuliana_package_progression", "uuid, integer, integer"],
  ["tb810_rebuild_unit_account_balance", "uuid"],
  ["tb810_ensure_unit_account_for_unit", "uuid"],
];

// Legacy pre-approval snapshot entry points: no API role at all.
const apiDenied = [
  ["tb810_create_monthly_obligation_snapshot", "uuid, integer, integer, jsonb, uuid[]"],
  ["tb810_create_monthly_obligation_snapshot_system", "uuid, integer, integer, jsonb, uuid[]"],
];

const humanHandoff = ["tb810_mark_monthly_obligation_ready_for_review", "uuid, integer, integer, integer, integer, uuid[]"];
const lockedTables = ["tb810_receipts", "tb810_invoice_line_items"];

test("unguarded definer RPCs are revoked from PUBLIC and anon only", () => {
  for (const [name, args] of anonDenied) {
    assert.match(lockdown, new RegExp(`revoke execute on function public\\.${name}\\(${escape(args)}\\)\\s+from public, anon;`), name);
  }
  // The staff app and Pulse (service_role) still need these reads.
  assert.doesNotMatch(lockdown, /revoke[^;]+tb810_get_building_month_financial_facts[^;]+(authenticated|service_role)/);
  assert.doesNotMatch(lockdown, /revoke[^;]+tb810_get_giuliana_package_progression[^;]+(authenticated|service_role)/);
});

test("legacy snapshot RPCs are unreachable from every API role", () => {
  for (const [name, args] of apiDenied) {
    assert.match(lockdown, new RegExp(`revoke all on function public\\.${name}\\(${escape(args)}\\)\\s+from public, anon, authenticated, service_role;`), name);
  }
  assert.doesNotMatch(lockdown, /drop function/);
});

test("staff have no manual handoff path and Pulse keeps its system handoff", () => {
  const [name, args] = humanHandoff;
  assert.match(lockdown, new RegExp(`revoke all on function public\\.${name}\\(${escape(args)}\\)\\s+from public, anon, authenticated;`));
  assert.doesNotMatch(lockdown, /tb810_mark_monthly_obligation_ready_for_review_system/);
});

test("unused receipt tables deny API roles through RLS without policies", () => {
  for (const table of lockedTables) {
    assert.match(lockdown, new RegExp(`alter table public\\.${table} enable row level security;`));
  }
  assert.doesNotMatch(lockdown, /create policy/);
});

test("the Pulse operational-month function is executable by service_role only", () => {
  const [file, sql] = laterMigrations.find(([name]) => name === "20261009140000_pulse_operational_month_container.sql") ?? [];
  assert.ok(file, "operational-month migration exists");
  const fn = "tb810_ensure_operational_billing_period_system";
  assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\(uuid\\)\\s+from public, anon, authenticated;`));
  assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) to service_role;`));
  assert.doesNotMatch(sql, new RegExp(`grant[^;]+${fn}[^;]+to[^;]*\\b(public|anon|authenticated)\\b`, "i"));
  for (const [laterFile, laterSql] of laterMigrations.filter(([name]) => name > file)) {
    assert.doesNotMatch(laterSql, new RegExp(`grant[^;]+public\\.${fn}\\([^;]+to[^;]*\\b(public|anon|authenticated)\\b`, "i"), laterFile);
  }
});

test("later migrations do not reopen the locked surfaces", () => {
  for (const [file, sql] of laterMigrations) {
    for (const [name] of [...anonDenied, ...apiDenied]) {
      assert.doesNotMatch(sql, new RegExp(`grant[^;]+public\\.${name}\\([^;]+to[^;]*\\b(public|anon)\\b`, "i"), `${file}: ${name}`);
    }
    for (const [name] of apiDenied) {
      assert.doesNotMatch(sql, new RegExp(`grant[^;]+public\\.${name}\\(`, "i"), `${file}: ${name}`);
    }
    assert.doesNotMatch(sql, new RegExp(`grant[^;]+public\\.${humanHandoff[0]}\\(`, "i"), `${file}: human handoff`);
    for (const table of lockedTables) {
      assert.doesNotMatch(sql, new RegExp(`alter table public\\.${table} disable row level security`, "i"), `${file}: ${table}`);
    }
    // Dropping and recreating a locked function would reset its ACL, so the
    // same migration must restate the revoke.
    for (const [name] of [...anonDenied, ...apiDenied, humanHandoff]) {
      if (new RegExp(`drop function[^;]+public\\.${name}\\(`, "i").test(sql)) {
        assert.match(sql, new RegExp(`revoke[^;]+public\\.${name}\\([^;]+from[^;]*\\banon\\b`, "i"), `${file}: ${name} recreated without revoke`);
      }
    }
  }
});
