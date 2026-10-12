import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Replays every migration's CREATE TABLE / GRANT / REVOKE statements in order,
// starting from what a fresh replay gets from the public-schema default ACL:
// no SELECT, INSERT, UPDATE or DELETE for the API roles. A table that only
// worked through permissive defaults fails here.

const migrationsDir = path.join(process.cwd(), "supabase/migrations");
const FIX = "20261012120000_restore_financial_table_grants.sql";
const ROLES = ["authenticated", "service_role"];
const DML = ["select", "insert", "update", "delete"];

// DEV journals are revoked from every API role on purpose.
const intentionallyDenied = new Set(["tb810_dev_test_sessions", "tb810_dev_test_mutations"]);

// Tables the system Pulse (createSystemClient) reads directly.
const systemReads = ["tb810_budget_plans", "tb810_unit_accounts", "tb810_meter_readings"];

const financialMinimum = {
  tb810_budget_plans: { authenticated: ["select", "insert", "update"], service_role: ["select"] },
  tb810_charges: { authenticated: ["select", "insert", "update", "delete"], service_role: [] },
  tb810_gas_bills: { authenticated: ["select", "insert", "update", "delete"], service_role: [] },
  tb810_gas_readings: { authenticated: ["select", "insert", "update", "delete"], service_role: [] },
  tb810_monthly_financial_obligations: { authenticated: ["select"], service_role: [] },
};

function statementsOf(sql) {
  return sql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "")
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
}

function parsePrivileges(list) {
  const items = list.split(",").map((item) => item.trim());
  return items.some((item) => item === "all" || item === "all privileges") ? DML : items.filter((item) => DML.includes(item));
}

function parseRoles(list) {
  return list.split(",").map((item) => item.trim()).filter((role) => ROLES.includes(role));
}

function replayTableGrants({ exclude = [] } = {}) {
  const grants = new Map();
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql") && !exclude.includes(file)).sort();
  for (const file of files) {
    for (const statement of statementsOf(readFileSync(path.join(migrationsDir, file), "utf8"))) {
      const created = statement.match(/^create table (?:if not exists )?public\.(tb810_\w+)/);
      if (created) {
        grants.set(created[1], { authenticated: new Set(), service_role: new Set() });
        continue;
      }
      const all = statement.match(/^grant (.+?) on all tables in schema public to (.+)$/);
      if (all) {
        for (const table of grants.values()) {
          for (const role of parseRoles(all[2])) for (const privilege of parsePrivileges(all[1])) table[role].add(privilege);
        }
        continue;
      }
      const grant = statement.match(/^grant (.+?) on (?:table )?public\.(tb810_\w+) to (.+)$/);
      if (grant && grants.has(grant[2])) {
        for (const role of parseRoles(grant[3])) for (const privilege of parsePrivileges(grant[1])) grants.get(grant[2])[role].add(privilege);
        continue;
      }
      const revoke = statement.match(/^revoke (.+?) on (?:table )?public\.(tb810_\w+) from (.+)$/);
      if (revoke && grants.has(revoke[2])) {
        for (const role of parseRoles(revoke[3])) for (const privilege of parsePrivileges(revoke[1])) grants.get(revoke[2])[role].delete(privilege);
      }
    }
  }
  return grants;
}

const sorted = (set) => [...set].sort();

test("every application table is readable by authenticated after a fresh replay", () => {
  const grants = replayTableGrants();
  assert.ok(grants.size > 30, "replay found the TB810 tables");
  for (const [table, privileges] of grants) {
    if (intentionallyDenied.has(table)) continue;
    assert.ok(privileges.authenticated.has("select"), `${table} has no SELECT for authenticated`);
  }
});

test("tables read by the system Pulse are readable by service_role", () => {
  const grants = replayTableGrants();
  for (const table of systemReads) {
    assert.ok(grants.get(table)?.service_role.has("select"), `${table} has no SELECT for service_role`);
  }
});

test("financial tables hold exactly the minimum privileges", () => {
  const grants = replayTableGrants();
  for (const [table, expected] of Object.entries(financialMinimum)) {
    for (const role of ROLES) {
      assert.deepEqual(sorted(grants.get(table)[role]), [...expected[role]].sort(), `${table} ${role}`);
    }
  }
});

test("Monthly Obligations stay write-protected from every API role", () => {
  const privileges = replayTableGrants().get("tb810_monthly_financial_obligations");
  for (const role of ROLES) {
    for (const write of ["insert", "update", "delete"]) assert.ok(!privileges[role].has(write), `${role} ${write}`);
  }
});

test("DEV journals stay unreachable from every API role", () => {
  const grants = replayTableGrants();
  for (const table of intentionallyDenied) {
    for (const role of ROLES) assert.deepEqual(sorted(grants.get(table)[role]), [], `${table} ${role}`);
  }
});

test("without the fix, the replay reproduces the financial read gap", () => {
  const grants = replayTableGrants({ exclude: [FIX] });
  for (const table of Object.keys(financialMinimum)) {
    assert.ok(!grants.get(table).authenticated.has("select"), `${table} was expected to lack SELECT before ${FIX}`);
  }
  assert.ok(!grants.get("tb810_budget_plans").service_role.has("select"));
});
