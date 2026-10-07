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
      if (name === "tb810_get_giuliana_package_progression") {
        // Same walk as the SQL: from the start month, advance while the package is handed off.
        const handedOff = new Set(["ready_for_review", "approved", "invoices_generated", "closed"]);
        let ordinal = args.p_start_year * 12 + args.p_start_month - 1;
        const at = (o) => periods.find((p) => p.period_year === Math.floor(o / 12) && p.period_month === (o % 12) + 1);
        while (at(ordinal) && handedOff.has(at(ordinal).status)) ordinal += 1;
        const month = `${Math.floor(ordinal / 12)}-${String((ordinal % 12) + 1).padStart(2, "0")}`;
        return Promise.resolve({ data: { activePackage: { obligationMonth: month, mode: "live", status: at(ordinal)?.status ?? null }, mostRecentHandoff: null, pendingReviews: [] }, error: null });
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

test("start over follows source editability alone: a complete prior month stays recoverable after the month turn", async () => {
  const rpcCalls = [];
  const service = loadService({ businessDate: "2026-10-07", periods: livePeriods(), rpcCalls });
  const clears = () => rpcCalls.filter((c) => c.name === "tb810_clear_current_unit_water_month").map((c) => c.args.p_month_key);

  assert.equal((await service.clearCurrentUnitWaterMonth("2026-09")).error, null, "September open: October not finalized");
  assert.equal((await service.clearCurrentUnitWaterMonth("2026-10")).error, null, "October open: November absent");
  for (const month of ["2026-08", "2026-11"]) {
    assert.equal((await service.clearCurrentUnitWaterMonth(month)).error, "This Unit Water month is not available for editing.", month);
  }
  assert.deepEqual(clears(), ["2026-09", "2026-10"], "frozen and future months never reach the RPC");

  const frozenLater = loadService({ businessDate: "2026-10-07", periods: livePeriods({ "2026-10": "approved" }), rpcCalls: [] });
  assert.equal((await frozenLater.clearCurrentUnitWaterMonth("2026-09")).error, "This Unit Water month is not available for editing.", "October finalized freezes September");

  const source = readFileSync(path.join(root, "server/water/unit-meter-readings.ts"), "utf8");
  const clearFn = source.slice(source.indexOf("export async function clearCurrentUnitWaterMonth"), source.indexOf("function monthStartFromKey"));
  assert.match(clearFn, /canEditSourceMonth\(monthKey, await getBusinessNow\(\)\)/);
  assert.doesNotMatch(clearFn, /getActiveReadingMonth|current_date|isUnitWaterStartOverAvailable/, "no calendar gate in the action");
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
      canEditSourceMonth: async (month, reference) => { seen.push([month, reference.toISOString().slice(0, 10)]); return { allowed: month === "2026-09", error: null }; },
    },
    "../_components/unit-meter-readings-month-page": { UnitMeterReadingsMonthPage: () => null },
  }).default;
  const september = await route({ params: Promise.resolve({ month: "2026-09" }) });
  assert.equal(september.props.sourceMonthOpen, true);
  assert.equal("startOverAvailable" in september.props, false, "Start Over has no separate calendar gate");
  const august = await route({ params: Promise.resolve({ month: "2026-08" }) });
  assert.equal(august.props.sourceMonthOpen, false);
  assert.deepEqual(seen, [["2026-09", "2026-10-07"], ["2026-08", "2026-10-07"]]);
  await assert.rejects(route({ params: Promise.resolve({ month: "nope" }) }), /REDIRECT:\/water\/unit-meter-readings$/, "invalid months resolve through the primary-month default");
});

const units = Array.from({ length: 64 }, (_, index) => ({ id: `unit-${index}`, unit_number: String(201 + index), floor: null }));
const iconStub = (name) => {
  const Icon = () => React.createElement("svg", { "data-icon": name });
  Icon.displayName = `IconStub(${name})`;
  return Icon;
};
const icons = new Proxy({}, { get: (_target, name) => iconStub(String(name)) });

const MONTH_OPTIONS = [
  { key: "2026-10", label: "October 2026", note: "Next source work" },
  { key: "2026-09", label: "September 2026", note: "Current work" },
  { key: "2026-08", label: "August 2026" },
];

function renderMonthPage({ month, sourceMonthOpen, rows }) {
  const { UnitMeterReadingsMonthPage } = loadModule("app/(staff)/water/unit-meter-readings/_components/unit-meter-readings-month-page.tsx", {
    "@/server/water/unit-meter-readings": {
      getOperatingReadingMonth: async () => ({ key: "2026-10", label: "October 2026" }),
      getWaterReadingUnits: async () => ({ data: units, error: null }),
      listUnitMeterReadingMonths: async () => ({ data: MONTH_OPTIONS, error: null }),
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
  return UnitMeterReadingsMonthPage({ month, historicalEditingAvailable: false, sourceMonthOpen });
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

// ---------------------------------------------------------------------------
// Delayed cycle: the primary Unit Water month follows K6 progression.

test("primary source month is the month consumed by the active package, never ahead of the operating month", () => {
  assert.equal(rule.primaryUnitWaterSourceMonth({ activeObligationMonth: "2026-10", operatingMonth: "2026-10" }), "2026-09");
  assert.equal(rule.primaryUnitWaterSourceMonth({ activeObligationMonth: "2026-11", operatingMonth: "2026-10" }), "2026-10");
  assert.equal(rule.primaryUnitWaterSourceMonth({ activeObligationMonth: "2026-12", operatingMonth: "2026-10" }), "2026-10", "early handoffs clamp");
  assert.equal(rule.primaryUnitWaterSourceMonth({ activeObligationMonth: "2027-01", operatingMonth: "2027-01" }), "2026-12", "year boundary");
  assert.equal(rule.unitWaterMonthNote({ month: "2026-09", primaryMonth: "2026-09", sourceMonthOpen: true }), "Current work");
  assert.equal(rule.unitWaterMonthNote({ month: "2026-10", primaryMonth: "2026-09", sourceMonthOpen: true }), "Next source work");
  assert.equal(rule.unitWaterMonthNote({ month: "2026-09", primaryMonth: "2026-10", sourceMonthOpen: true }), "Open for corrections");
  assert.equal(rule.unitWaterMonthNote({ month: "2026-08", primaryMonth: "2026-09", sourceMonthOpen: false }), undefined, "frozen months stay historical");
});

test("October 7 delayed cycle: September is current work, October is next source work, August frozen, November closed", async () => {
  const rpcCalls = [];
  const service = loadService({ businessDate: "2026-10-07", periods: livePeriods(), readingMonths: ["2026-09", "2026-08", "2026-07"], rpcCalls });
  const business = new Date("2026-10-07T00:00:00Z");

  assert.deepEqual((await service.getPrimaryUnitWaterSourceMonth()).data, { key: "2026-09", label: "September 2026", note: "Current work" });
  const progression = rpcCalls.find((c) => c.name === "tb810_get_giuliana_package_progression");
  assert.deepEqual(progression.args, { p_building_id: BUILDING, p_start_year: 2026, p_start_month: 10 }, "canonical K6 progression from the operating month");

  assert.deepEqual((await service.listUnitMeterReadingMonths()).data, [
    { key: "2026-10", label: "October 2026", note: "Next source work" },
    { key: "2026-09", label: "September 2026", note: "Current work" },
    { key: "2026-08", label: "August 2026" },
    { key: "2026-07", label: "July 2026" },
  ]);
  assert.equal((await service.canEditSourceMonth("2026-09", business)).allowed, true, "September editable");
  assert.equal((await service.canEditSourceMonth("2026-10", business)).allowed, true, "October editable");
  assert.equal((await service.canEditSourceMonth("2026-08", business)).allowed, false, "August frozen");
  assert.equal((await service.canEditSourceMonth("2026-11", business)).allowed, false, "November future");
  assert.equal((await service.clearCurrentUnitWaterMonth("2026-09")).error, null, "September Start Over available");
});

test("progression advance: once October is handed off, October becomes current work without a calendar switch", async () => {
  const lateOctober = loadService({ businessDate: "2026-10-28", periods: livePeriods({ "2026-10": "ready_for_review" }), readingMonths: ["2026-09", "2026-08"] });
  assert.equal((await lateOctober.getPrimaryUnitWaterSourceMonth()).data.key, "2026-10", "same calendar month, progression advanced");
  const months = (await lateOctober.listUnitMeterReadingMonths()).data;
  assert.equal(months.find((m) => m.key === "2026-10").note, "Current work");
  assert.equal(months.find((m) => m.key === "2026-09").note, "Open for corrections", "September stays correctable until October is approved");

  const november = loadService({ businessDate: "2026-11-03", periods: livePeriods({ "2026-10": "approved" }), readingMonths: ["2026-10", "2026-09"] });
  assert.equal((await november.getPrimaryUnitWaterSourceMonth()).data.key, "2026-10");
  const novemberMonths = (await november.listUnitMeterReadingMonths()).data;
  assert.equal(novemberMonths.find((m) => m.key === "2026-11").note, "Next source work");
  assert.equal(novemberMonths.find((m) => m.key === "2026-09").note, undefined, "September frozen by the October approval");

  const inSeptember = loadService({ businessDate: "2026-09-15", periods: livePeriods({ "2026-09": "absent" }), readingMonths: ["2026-08"] });
  assert.equal((await inSeptember.getPrimaryUnitWaterSourceMonth()).data.key, "2026-08", "September package live: its August source is current work");
});

test("default Unit Water route resolves to the primary source month", async () => {
  const resolve = (primary) => loadModule("app/(staff)/water/unit-meter-readings/page.tsx", {
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "@/server/water/unit-meter-readings": { getPrimaryUnitWaterSourceMonth: async () => ({ data: { key: primary, label: primary }, error: null }) },
  }).default;
  await assert.rejects(resolve("2026-09")({}), /REDIRECT:\/water\/unit-meter-readings\/2026-09$/);
  await assert.rejects(resolve("2026-09")({ searchParams: Promise.resolve({ month: "2026-10" }) }), /REDIRECT:\/water\/unit-meter-readings\/2026-10$/, "explicit month still wins");
  const failing = loadModule("app/(staff)/water/unit-meter-readings/page.tsx", {
    "next/navigation": { redirect: () => { throw new Error("REDIRECT"); } },
    "@/server/water/unit-meter-readings": { getPrimaryUnitWaterSourceMonth: async () => ({ data: null, error: "progression unavailable" }) },
  }).default;
  await assert.rejects(failing({}), /progression unavailable/, "no silent calendar fallback");
});

test("a complete open September offers Start over and shows it as current work", async () => {
  const rows = units.map((unit, index) => ({
    id: `reading-${index}`, unit_id: unit.id, unit_number: unit.unit_number, previous_reading: 2006, reading_end: 2007,
    reading_date: "2026-09-05", notes: null, status: "recorded", previous_reading_date: "2026-08-05",
  }));
  const html = renderToStaticMarkup(await renderMonthPage({ month: "2026-09", sourceMonthOpen: true, rows }));
  assert.match(html, /64 of 64 complete/);
  assert.match(html, />Start over</, "bulk correction available after the calendar month turned");
  assert.doesNotMatch(html, /\+ Upload readings/, "complete months recover through Start over first");
  assert.match(html, /<p class="mt-1 text-sm text-zinc-500">Current work<\/p>/, "quiet orientation under the month");
});

test("an empty open October is next source work with intake available", async () => {
  const html = renderToStaticMarkup(await renderMonthPage({ month: "2026-10", sourceMonthOpen: true, rows: [] }));
  assert.match(html, /0 of 64 complete/);
  assert.match(html, /\+ Upload readings/);
  assert.match(html, /<p class="mt-1 text-sm text-zinc-500">Next source work<\/p>/);
});
