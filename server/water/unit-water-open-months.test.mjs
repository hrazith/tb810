import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// Unit Water open source months: a source month S is actionable while S is not
// after the operating (business) month and its consuming package S+1 is not
// finalized. Reproduces the September 2026 defect against a live-shaped,
// in-memory database; nothing here touches a real database.
const root = process.cwd();
const requireFromRoot = createRequire(path.join(root, "package.json"));
const React = requireFromRoot("react");
const { renderToStaticMarkup } = requireFromRoot("react-dom/server");

function loadModule(file, mocks = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = readFileSync(filename, "utf8");
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const nativeRequire = createRequire(filename);
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    function require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const target = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        for (const suffix of [".ts", ".tsx", "/index.ts"]) {
          try { return load(target + suffix); } catch (error) { if (error.code !== "ENOENT") throw error; }
        }
        throw new Error(`Unmocked module: ${specifier}`);
      }
      return nativeRequire(specifier);
    }
    runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, loaded, loaded.exports);
    return loaded.exports;
  }
  return load(path.join(root, file));
}

const BUILDING = "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810";

// Live shape on 2026-10-07: 2023-09…2026-08 closed, 2026-09 approved, no October.
function livePeriods(overrides = {}) {
  const periods = [];
  for (let ordinal = 2023 * 12 + 8; ordinal <= 2026 * 12 + 8; ordinal += 1) {
    const year = Math.floor(ordinal / 12);
    const month = (ordinal % 12) + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const status = overrides[key] ?? (key === "2026-09" ? "approved" : "closed");
    if (status !== "absent") periods.push({ building_id: BUILDING, period_year: year, period_month: month, status });
  }
  for (const [key, status] of Object.entries(overrides)) {
    const [year, month] = key.split("-").map(Number);
    if (status !== "absent" && !periods.some((p) => p.period_year === year && p.period_month === month)) {
      periods.push({ building_id: BUILDING, period_year: year, period_month: month, status });
    }
  }
  return periods;
}

// Minimal read-only query builder over billing periods; records RPC calls.
function fakeSupabase({ periods, readingMonths = [], rpcCalls = [] }) {
  return {
    rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === "tb810_list_meter_reading_months") {
        return Promise.resolve({ data: readingMonths.map((m) => ({ reading_month: `${m}-01` })), error: null });
      }
      return Promise.resolve({ data: 0, error: null });
    },
    from(table) {
      assert.equal(table, "tb810_billing_periods", `unexpected table ${table}`);
      const filters = [];
      let ordered = false;
      let limit = Infinity;
      const run = () => {
        let rows = periods.filter((row) => filters.every((f) => f(row)));
        if (ordered) rows = [...rows].sort((a, b) => (b.period_year * 12 + b.period_month) - (a.period_year * 12 + a.period_month));
        return rows.slice(0, limit);
      };
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push((row) => row[column] === value); return builder; },
        in(column, values) { filters.push((row) => values.includes(row[column])); return builder; },
        order() { ordered = true; return builder; },
        limit(value) { limit = value; return builder; },
        maybeSingle() { return Promise.resolve({ data: run()[0] ?? null, error: null }); },
        then(resolve, reject) { return Promise.resolve({ data: run(), error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
}

function loadService({ businessDate, periods, readingMonths, rpcCalls }) {
  const supabase = fakeSupabase({ periods, readingMonths, rpcCalls });
  return loadModule("server/water/unit-meter-readings.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/server/business-date": { getBusinessNow: async () => new Date(`${businessDate}T00:00:00Z`) },
    "@/server/units": { getCurrentBuilding: async () => ({ data: { id: BUILDING }, error: null }), listUnits: async () => ({ data: [], error: null }) },
    "@/server/dev-test-session": { getActiveDevTestSessionId: async () => null, isRecordCreatedByActiveDevTestSession: async () => false, recordDevTestMutation: async () => ({ error: null }) },
  });
}

const rule = loadModule("server/water/source-editability.ts");

test("candidate source months start at the latest finalized consuming package", () => {
  assert.deepEqual(rule.sourceMonthCandidates({ latestFinalizedConsumingMonth: "2026-09", operatingMonth: "2026-10" }), ["2026-09", "2026-10"]);
  assert.deepEqual(rule.sourceMonthCandidates({ latestFinalizedConsumingMonth: null, operatingMonth: "2026-10" }), ["2026-10"]);
  assert.deepEqual(rule.sourceMonthCandidates({ latestFinalizedConsumingMonth: "2026-12", operatingMonth: "2027-02" }), ["2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(rule.sourceMonthCandidates({ latestFinalizedConsumingMonth: "2026-11", operatingMonth: "2026-10" }), [], "rewound business date");
});

test("the canonical rule: open consumers keep a source open, finalized ones freeze it, the future is closed", () => {
  const open = (sourceMonth, status) => rule.isSourceMonthEditable({ sourceMonth, activeMonth: "2026-10", consumingPackage: status ? { status } : null });
  assert.equal(open("2026-09", null), true, "consumer absent");
  for (const status of ["draft", "collecting_readings", "ready_for_review"]) assert.equal(open("2026-09", status), true, status);
  for (const status of ["approved", "invoices_generated", "closed"]) assert.equal(open("2026-08", status), false, status);
  assert.equal(open("2026-11", null), false, "after the operating month");
});

test("original defect: operating month October 2026, September at 0 readings, October absent — September is listed", async () => {
  const service = loadService({ businessDate: "2026-10-07", periods: livePeriods(), readingMonths: ["2026-08", "2026-07", "2026-06", "2026-05"] });
  assert.deepEqual((await service.listOpenUnitWaterSourceMonths()).data, ["2026-09", "2026-10"]);
  const months = (await service.listUnitMeterReadingMonths()).data.map((m) => m.key);
  assert.deepEqual(months, ["2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"], "historical months with readings are retained");
});

test("September stays open when the calendar turns, until October is finalized", async () => {
  const inSeptember = loadService({ businessDate: "2026-09-15", periods: livePeriods(), readingMonths: ["2026-08"] });
  assert.deepEqual((await inSeptember.listOpenUnitWaterSourceMonths()).data, ["2026-09"], "business date in September");

  const octoberHandedOff = loadService({ businessDate: "2026-10-07", periods: livePeriods({ "2026-10": "ready_for_review" }) });
  assert.deepEqual((await octoberHandedOff.listOpenUnitWaterSourceMonths()).data, ["2026-09", "2026-10"]);

  const octoberApproved = loadService({ businessDate: "2026-10-07", periods: livePeriods({ "2026-10": "approved" }), readingMonths: ["2026-08"] });
  assert.deepEqual((await octoberApproved.listOpenUnitWaterSourceMonths()).data, ["2026-10"]);
  assert.ok(!(await octoberApproved.listUnitMeterReadingMonths()).data.some((m) => m.key === "2026-09"), "a finalized empty month is not offered");
});

test("source editability follows the business date for September, August and the future", async () => {
  const service = loadService({ businessDate: "2026-10-07", periods: livePeriods() });
  const business = new Date("2026-10-07T00:00:00Z");
  assert.equal((await service.canEditSourceMonth("2026-09", business)).allowed, true, "September open: October absent");
  assert.equal((await service.canEditSourceMonth("2026-08", business)).allowed, false, "August frozen: September approved");
  assert.equal((await service.canEditSourceMonth("2026-11", business)).allowed, false, "future month");
  assert.equal((await service.canEditSourceMonth("2026-10", new Date("2026-09-15T00:00:00Z"))).allowed, false, "October is future when the business date is September");
});

test("start over uses source editability and stays within the database start-over contract", async () => {
  const rpcCalls = [];
  const service = loadService({ businessDate: "2026-10-07", periods: livePeriods(), rpcCalls });
  assert.equal(service.isUnitWaterStartOverAvailable("2026-10", true, new Date("2026-10-07T00:00:00Z")), true);
  assert.equal(service.isUnitWaterStartOverAvailable("2026-10", false, new Date("2026-10-07T00:00:00Z")), false, "frozen month");
  assert.equal(service.isUnitWaterStartOverAvailable("2026-09", true, new Date("2026-10-07T00:00:00Z")), false, "database accepts only its current month");

  const frozen = await service.clearCurrentUnitWaterMonth("2026-08");
  assert.match(frozen.error, /can be started over/);
  assert.equal(rpcCalls.filter((c) => c.name === "tb810_clear_current_unit_water_month").length, 0, "frozen month never reaches the RPC");
  const source = readFileSync(path.join(root, "server/water/unit-meter-readings.ts"), "utf8");
  const clearFn = source.slice(source.indexOf("export async function clearCurrentUnitWaterMonth"), source.indexOf("export async function listUnitMeterReadingMonths"));
  assert.match(clearFn, /canEditSourceMonth\(monthKey, await getBusinessNow\(\)\)/);
  assert.doesNotMatch(clearFn, /getActiveReadingMonth\(\)/, "no calendar-equality-only check remains");
});

test("template import uses source editability, not equality with the calendar month", async () => {
  const calls = [];
  const validator = loadModule("server/import/water/meter-reading-import-validator.ts", {
    "@/server/business-date": { getBusinessNow: async () => new Date("2026-10-07T00:00:00Z") },
    "@/server/water/unit-meter-readings": {
      canEditSourceMonth: async (month, reference) => {
        calls.push([month, reference.toISOString().slice(0, 10)]);
        return { allowed: month === "2026-09", error: null };
      },
    },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => { throw new Error("CONTEXT_REACHED"); } }) },
    "@/server/units": { getCurrentBuilding: async () => ({ data: null, error: null }), listUnits: async () => ({ data: [], error: null }) },
  });
  await assert.rejects(validator.validateMeterReadingImport("2026-08", []), /August 2026 is not editable/);
  await assert.rejects(validator.validateMeterReadingImport("2026-09", []), /CONTEXT_REACHED/, "an open prior month passes the month guard");
  assert.deepEqual(calls, [["2026-08", "2026-10-07"], ["2026-09", "2026-10-07"]]);
});

test("the month route decides intake from source editability on the business date", async () => {
  const seen = [];
  const route = loadModule("app/(staff)/water/unit-meter-readings/[month]/page.tsx", {
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "@/server/business-date": { getBusinessNow: async () => new Date("2026-10-07T00:00:00Z") },
    "@/server/water/unit-meter-readings": {
      getActiveReadingMonth: (now) => ({ key: now.toISOString().slice(0, 7) }),
      canEditSourceMonth: async (month, reference) => { seen.push([month, reference.toISOString().slice(0, 10)]); return { allowed: month === "2026-09", error: null }; },
      isUnitWaterStartOverAvailable: (month, open) => open && month === "2026-10",
    },
    "../_components/unit-meter-readings-month-page": { UnitMeterReadingsMonthPage: () => null },
  }).default;
  const september = await route({ params: Promise.resolve({ month: "2026-09" }) });
  assert.equal(september.props.sourceMonthOpen, true);
  assert.equal(september.props.startOverAvailable, false);
  const august = await route({ params: Promise.resolve({ month: "2026-08" }) });
  assert.equal(august.props.sourceMonthOpen, false);
  assert.deepEqual(seen, [["2026-09", "2026-10-07"], ["2026-08", "2026-10-07"]]);
});

const units = Array.from({ length: 64 }, (_, index) => ({ id: `unit-${index}`, unit_number: String(201 + index), floor: null }));
const iconStub = (name) => {
  const Icon = () => React.createElement("svg", { "data-icon": name });
  Icon.displayName = `IconStub(${name})`;
  return Icon;
};
const icons = new Proxy({}, { get: (_target, name) => iconStub(String(name)) });

function renderMonthPage({ month, sourceMonthOpen, rows }) {
  const { UnitMeterReadingsMonthPage } = loadModule("app/(staff)/water/unit-meter-readings/_components/unit-meter-readings-month-page.tsx", {
    "@/server/water/unit-meter-readings": {
      getOperatingReadingMonth: async () => ({ key: "2026-10", label: "October 2026" }),
      getWaterReadingUnits: async () => ({ data: units, error: null }),
      listUnitMeterReadingMonths: async () => ({ data: [{ key: "2026-10", label: "October 2026" }, { key: "2026-09", label: "September 2026" }, { key: "2026-08", label: "August 2026" }], error: null }),
      listUnitMeterReadings: async () => ({ data: rows, error: null }),
      getPreviousMeterReadingsForMonth: async () => ({ data: {}, error: null }),
    },
    "../actions": new Proxy({}, { get: () => async () => ({}) }),
    "@/components/dev-tools": { useDevTools: () => ({ historicalEditingEnabled: false }) },
    "@phosphor-icons/react/dist/ssr": icons,
    "@phosphor-icons/react": icons,
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "next/link": { __esModule: true, default: ({ href, children }) => React.createElement("a", { href }, children) },
  });
  return UnitMeterReadingsMonthPage({ month, historicalEditingAvailable: false, sourceMonthOpen, startOverAvailable: false });
}

test("an open empty September renders the intake workspace: 64 expected rows at 0 of 64", async () => {
  const html = renderToStaticMarkup(await renderMonthPage({ month: "2026-09", sourceMonthOpen: true, rows: [] }));
  assert.match(html, /0 of 64 complete/);
  assert.equal((html.match(/placeholder="dd\/mm\/yyyy"/g) ?? []).length, 64, "one expected row per condo");
  assert.match(html, /Upload readings/, "canonical intake controls available");
  assert.doesNotMatch(html, /No meter readings found/);
});

test("a finalized August stays a read-only history view", async () => {
  const rows = units.map((unit, index) => ({
    id: `reading-${index}`, unit_id: unit.id, unit_number: unit.unit_number, previous_reading: 100, reading_end: 110,
    reading_date: "2026-08-05", notes: null, status: "recorded", previous_reading_date: "2026-07-05",
  }));
  const html = renderToStaticMarkup(await renderMonthPage({ month: "2026-08", sourceMonthOpen: false, rows }));
  assert.doesNotMatch(html, /Upload readings|Start over/, "no intake, import or reset controls");
  assert.doesNotMatch(html, /placeholder="dd\/mm\/yyyy"/, "no editable or expected rows");
  assert.match(html, /05\/08\/2026/, "existing readings remain visible");
});
