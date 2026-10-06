import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// WATER-011: the legacy Monthly Water Ledger is retired. /water and
// /water/{YYYY-MM} only redirect into the canonical Unit Water surface.
const root = process.cwd();
const waterRoute = path.join(root, "app/(staff)/water");

// Static segments under /water. Anything else after /water/ falls into the
// dynamic [period] route, which only accepts YYYY-MM.
const staticWaterSegments = readdirSync(waterRoute)
  .filter((name) => statSync(path.join(waterRoute, name)).isDirectory() && !name.startsWith("[") && !name.startsWith("_"));

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|mjs|js)$/.test(name) && !name.includes(".test.") ? [full] : [];
  });
}

// Runtime application code. Offline one-off maintenance scripts under scripts/
// (historical imports, trial generators) are operator-run tools, not app code.
const runtimeFiles = ["app", "server", "components", "lib"].flatMap((dir) => sourceFiles(path.join(root, dir)));
const relative = (file) => path.relative(root, file);

// Execute the real route modules with next/navigation mocked; no database is touched.
function loadRoute(file) {
  const cache = new Map();
  const mocks = {
    "next/navigation": {
      notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
      redirect: (url) => { throw new Error(`REDIRECT:${url}`); },
    },
  };
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const nativeRequire = createRequire(filename);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    function require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const target = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        for (const suffix of [".ts", ".tsx"]) {
          try { return load(target + suffix); } catch (error) { if (error.code !== "ENOENT") throw error; }
        }
        throw new Error(`Unmocked module: ${specifier}`);
      }
      return nativeRequire(specifier);
    }
    runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, loaded, loaded.exports);
    return loaded.exports;
  }
  return load(path.join(root, file)).default;
}

async function outcome(file, params) {
  const Page = loadRoute(file);
  try {
    await Page(params === undefined ? undefined : { params: Promise.resolve(params) });
    return "RENDERED";
  } catch (error) {
    return error.message;
  }
}

test("/water redirects to the canonical Unit Water surface", async () => {
  assert.equal(await outcome("app/(staff)/water/page.tsx"), "REDIRECT:/water/unit-meter-readings");
});

test("/water/2026-09 redirects to /water/unit-meter-readings/2026-09", async () => {
  assert.equal(await outcome("app/(staff)/water/[period]/page.tsx", { period: "2026-09" }), "REDIRECT:/water/unit-meter-readings/2026-09");
});

test("malformed /water/[period] values are not found and never reinterpreted", async () => {
  for (const period of ["sedepal", "2026-09-01", "Sep 2026", "2026-9", "2026-13", "a2e0537b-9ea8-4fc7-9591-bac6c5336b14", ""]) {
    assert.equal(await outcome("app/(staff)/water/[period]/page.tsx", { period }), "NEXT_NOT_FOUND", `period "${period}"`);
  }
});

test("/workspace/water/2026-09 reaches the canonical Unit Water month without rendering legacy UI", async () => {
  const first = await outcome("app/(staff)/workspace/water/[period]/page.tsx", { period: "2026-09" });
  assert.equal(first, "REDIRECT:/water/2026-09");
  const forwardedPeriod = first.slice("REDIRECT:/water/".length);
  assert.equal(await outcome("app/(staff)/water/[period]/page.tsx", { period: forwardedPeriod }), "REDIRECT:/water/unit-meter-readings/2026-09");
  assert.deepEqual(readdirSync(path.join(root, "app/(staff)/workspace/water/[period]")), ["page.tsx"]);
  assert.deepEqual(readdirSync(path.join(waterRoute, "[period]")), ["page.tsx"]);
});

test("every literal internal /water/<segment> link targets a real Water route or a YYYY-MM month", () => {
  assert.deepEqual(staticWaterSegments.sort(), ["sedapal", "unit-meter-readings"]);
  const offenders = [];
  for (const file of runtimeFiles) {
    for (const match of readFileSync(file, "utf8").matchAll(/["'`]\/water\/([A-Za-z0-9_-]+)/g)) {
      const segment = match[1];
      if (staticWaterSegments.includes(segment) || /^\d{4}-\d{2}$/.test(segment)) continue;
      offenders.push(`${relative(file)}: /water/${segment}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("dashboard Water cards point at the canonical surfaces", () => {
  const dashboard = readFileSync(path.join(root, "app/(staff)/page.tsx"), "utf8");
  const cardHref = (label) => {
    const match = dashboard.match(new RegExp(`<Link href="([^"]+)"[^>]*>(?:(?!</Link>)[\\s\\S])*?${label}`));
    assert.ok(match, `${label} card found`);
    return match[1];
  };
  assert.equal(cardHref("Water meter reading"), "/water/unit-meter-readings");
  assert.equal(cardHref("Sedapal Bill"), "/water/sedapal");
  assert.doesNotMatch(dashboard, /sedepal/i);
});

test("the legacy Monthly Water Ledger write surface no longer exists", () => {
  for (const file of [
    "server/water/monthly-ledger.ts",
    "server/water/domain-home.ts",
    "server/water/period.ts",
    "app/(staff)/water/[period]/actions.ts",
    "app/(staff)/water/[period]/_components/monthly-water-ledger-form.tsx",
    "app/(staff)/workspace/water/[period]/actions.ts",
    "app/(staff)/workspace/water/[period]/_components/monthly-water-ledger-form.tsx",
  ]) {
    assert.equal(existsSync(path.join(root, file)), false, `${file} must stay deleted`);
  }
  const resurrected = runtimeFiles.filter((file) => /\b(saveMonthlyWaterLedgerReadings|startNextWaterMonth|saveMonthlyWaterLedgerAction|MonthlyWaterLedgerForm|getWaterDomainHome)\b/.test(readFileSync(file, "utf8")));
  assert.deepEqual(resurrected.map(relative), []);
});

// Direct table writes to tb810_meter_readings: a write chained from
// .from("tb810_meter_readings") without another .from( in between.
const DIRECT_WRITE = /\.from\(\s*["']tb810_meter_readings["']\s*\)((?:(?!\.from\()[\s\S]){0,400}?)\.(insert|update|upsert|delete)\(/g;
const RPC_WRITE = /\.rpc\(\s*["'](tb810_sync_meter_reading_import|tb810_sync_dev_meter_reading_import|tb810_clear_current_unit_water_month)["']/g;

// Legitimate writers today: the canonical Unit Water module, its import
// persistence, and the development-only, journaled DEV completion tool.
const ALLOWED_DIRECT_WRITERS = new Set(["server/water/unit-meter-readings.ts", "server/water/dev-completion.ts"]);
const ALLOWED_RPC_WRITERS = new Set(["server/water/unit-meter-readings.ts", "server/import/water/meter-reading-import-persistence.ts"]);

test("the meter-reading write detector catches the retired ledger's write pattern", () => {
  const retiredPattern = `if (existing) {\n  const { error } = await supabase\n    .from("tb810_meter_readings")\n    .update(payload)\n    .eq("id", existing.id);\n} else {\n  await supabase.from("tb810_meter_readings").insert(payload);\n}`;
  assert.equal([...retiredPattern.matchAll(DIRECT_WRITE)].length, 2);
  const readOnly = `await supabase.from("tb810_meter_readings").select("id").eq("unit_id", id);\nawait supabase.from("tb810_units").update({ notes: null });`;
  assert.equal([...readOnly.matchAll(DIRECT_WRITE)].length, 0);
});

test("tb810_meter_readings is written only through the canonical Unit Water paths", () => {
  const offenders = [];
  for (const file of runtimeFiles) {
    const text = readFileSync(file, "utf8");
    if ([...text.matchAll(DIRECT_WRITE)].length > 0 && !ALLOWED_DIRECT_WRITERS.has(relative(file))) offenders.push(`direct write: ${relative(file)}`);
    if ([...text.matchAll(RPC_WRITE)].length > 0 && !ALLOWED_RPC_WRITERS.has(relative(file))) offenders.push(`write RPC: ${relative(file)}`);
  }
  assert.deepEqual(offenders, []);
  for (const allowed of [...ALLOWED_DIRECT_WRITERS, ...ALLOWED_RPC_WRITERS]) {
    assert.ok(existsSync(path.join(root, allowed)), `${allowed} still exists`);
  }
});
