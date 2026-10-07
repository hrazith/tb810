import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const root = process.cwd();
const route = "app/(staff)/water/sedapal";

// Execute the actual TS/TSX modules with only infrastructure replaced. No live
// database, credentials, lifecycle actions, or network clients are loaded.
function moduleLoader(mocks) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const nativeRequire = createRequire(filename);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    function require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const target = specifier.startsWith("@/")
          ? path.join(root, specifier.slice(2))
          : path.resolve(path.dirname(filename), specifier);
        for (const suffix of [".ts", ".tsx"]) {
          try { return load(target + suffix); } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
        throw new Error(`Unmocked module: ${specifier}`);
      }
      return nativeRequire(specifier);
    }
    runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}

const fixture = {
  id: "bill-1", building_id: "building-1", utility_type_id: "water-1",
  billing_period_id: "source-september", bill_date: "2026-09-05",
  amount: 3100, previous_reading: 12146, current_reading: 12846,
  total_consumption: 700, unit_cost: 4.4286,
  description: "  Original invoice reference  ", notes: "Keep original notes\n",
  attachment_document_id: "pdf-1", supplier_id: "supplier-1",
  legacy_table: "utilities", legacy_id: "legacy-1", legacy_metadata: { original: true },
  status: "received", tb810_documents: [{ id: "pdf-1", storage_path: "original.pdf" }],
};

function harness(status = "collecting_readings") {
  let stored = structuredClone(fixture);
  const writes = [];
  const revalidated = [];
  const supabase = {
    from(table) {
      const filters = {};
      let patch;
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        lt(key, value) { filters[`before_${key}`] = value; return query; },
        order() { return query; },
        limit() { return query; },
        or() {
          assert.equal(filters.building_id, fixture.building_id);
          return Promise.resolve({ data: [{ period_year: 2026, period_month: 10, status }], error: null });
        },
        update(value) { patch = value; return query; },
        async maybeSingle() {
          if (table === "tb810_utility_types") return { data: { id: "water-1", name: "Common Water" }, error: null };
          assert.equal(filters.building_id, fixture.building_id);
          if (table === "tb810_billing_periods") {
            assert.equal(filters.period_year, 2026);
            assert.equal(filters.period_month, 9);
            return { data: { id: "source-september" }, error: null };
          }
          assert.equal(table, "tb810_utility_bills");
          assert.equal(filters.utility_type_id, fixture.utility_type_id);
          return { data: filters.before_bill_date ? { current_reading: 12146 } : stored, error: null };
        },
        async single() {
          assert.equal(table, "tb810_utility_bills");
          assert.deepEqual(filters, { id: fixture.id, building_id: fixture.building_id, utility_type_id: fixture.utility_type_id });
          writes.push(patch);
          stored = { ...stored, ...patch };
          return { data: stored, error: null };
        },
      };
      return query;
    },
  };
  const mocks = {
    "@phosphor-icons/react/dist/ssr": { CaretLeft: () => null, CaretRight: () => null, CalendarBlank: () => null, FilePdf: () => null },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/server/units": { getCurrentBuilding: async () => ({ data: { id: fixture.building_id }, error: null }) },
    "@/server/perf": { isPerfLoggingEnabled: () => false },
    "@/server/water/unit-meter-readings": {},
    "@/server/dev-test-session": {},
    "next/cache": { revalidatePath: (...args) => revalidated.push(args) },
    "next/navigation": {
      redirect: (url) => { throw new Error(`REDIRECT:${url}`); },
      notFound: () => { throw new Error("NOT_FOUND"); },
    },
  };
  const load = moduleLoader(mocks);
  mocks["@/server/water"] = load("server/water/index.ts");
  const actions = load(`${route}/actions.ts`);
  return { load, actions, writes, revalidated, stored: () => stored };
}

function submitted(values = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    utility_bill_id: fixture.id, bill_date: fixture.bill_date,
    current_reading: "12846", amount: "2760.50", ...values,
  })) form.set(key, value);
  return form;
}

async function editPage(h) {
  return h.load(`${route}/[utilityBillId]/edit/page.tsx`).default({ params: Promise.resolve({ utilityBillId: fixture.id }) });
}

function findForm(element, component) {
  if (element?.type === component) return element;
  for (const child of [element?.props?.children].flat()) {
    const result = child && findForm(child, component);
    if (result) return result;
  }
}

test("Edit renders canonical prepopulated details with immutable context and Cancel", async () => {
  const h = harness();
  const page = await editPage(h);
  const component = h.load(`${route}/_components/common-water-bill-form.tsx`).CommonWaterBillForm;
  const form = findForm(page, component);
  assert.ok(form);
  assert.deepEqual(form.props.initialValues, {
    bill_date: "2026-09-05", amount: "3100.00", previous_reading: "12146", current_reading: "12846",
  });
  const html = renderToStaticMarkup(page);
  assert.match(html, /max-w-sm/);
  assert.match(html, /Edit Sedapal bill/);
  for (const [name, value] of Object.entries(form.props.initialValues)) {
    if (name !== "previous_reading") assert.match(html, new RegExp(`name="${name}"[^>]*value="${value}"`));
  }
  assert.match(html, /<input(?=[^>]*type="text")(?=[^>]*value="05\/09\/2026")[^>]*>/, "bill date is shown as DD/MM/YYYY");
  assert.match(html, /Previous reading/);
  assert.match(html, /12,146/);
  assert.doesNotMatch(html, /name="previous_reading"/);
  assert.doesNotMatch(html, /Service Month|Charge Month|Total Consumption|Unit Cost|name="description"|name="notes"/);
  assert.match(html, /Update bill/);
  assert.match(html, /href="\/water\/sedapal\/bill-1"[^>]*>Cancel/);
});

test("amount-only action uses the actual update service and preserves all unrelated data", async () => {
  const h = harness();
  await assert.rejects(h.actions.updateCommonWaterBillAction({}, submitted()), /REDIRECT:\/water\/sedapal$/);
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0], {
    bill_date: "2026-09-05", billing_period_id: "source-september", amount: 2760.5,
    current_reading: 12846, total_consumption: 700, unit_cost: 3.9436,
  });
  assert.deepEqual(h.stored(), { ...fixture, amount: 2760.5, unit_cost: 3.9436 });
  assert.ok(h.revalidated.some(([url]) => url === "/water/sedapal"));
});

test("date, amount and current reading reach the service; hidden metadata is not owned by Edit", async () => {
  const h = harness();
  await assert.rejects(h.actions.updateCommonWaterBillAction({}, submitted({
    bill_date: "2026-09-06", current_reading: "12847", amount: "2800.00",
    description: "replacement", notes: "replacement", attachment_document_id: "replacement", legacy_metadata: "replacement",
  })), /REDIRECT:/);
  assert.deepEqual(h.writes[0], {
    bill_date: "2026-09-06", billing_period_id: "source-september", amount: 2800,
    current_reading: 12847, total_consumption: 701, unit_cost: 3.9943,
  });
  for (const key of ["previous_reading", "description", "notes", "attachment_document_id", "legacy_metadata", "tb810_documents"]) {
    assert.deepEqual(h.stored()[key], fixture[key]);
  }
});

test("forged previous reading still reaches and is rejected by the existing server protection", async () => {
  const h = harness();
  const result = await h.actions.updateCommonWaterBillAction({}, submitted({ previous_reading: "12000" }));
  assert.equal(result.error, "Previous reading is read-only.");
  assert.equal(h.writes.length, 0);
});

test("current below stored previous reading remains rejected", async () => {
  const h = harness();
  const result = await h.actions.updateCommonWaterBillAction({}, submitted({ current_reading: "12000" }));
  assert.match(result.error, /greater than or equal/);
  assert.equal(h.writes.length, 0);
});

test("frozen packages reject both the Edit page and direct action", async () => {
  for (const status of ["approved", "invoices_generated", "closed"]) {
    const h = harness(status);
    await assert.rejects(editPage(h), /REDIRECT:\/water\/sedapal\/bill-1$/);
    const result = await h.actions.updateCommonWaterBillAction({}, submitted());
    assert.match(result.error, /locked/);
    assert.equal(h.writes.length, 0);
  }
});

test("handoff alone still permits the existing Edit action", async () => {
  const h = harness("ready_for_review");
  await assert.rejects(h.actions.updateCommonWaterBillAction({}, submitted()), /REDIRECT:/);
  assert.equal(h.writes.length, 1);
});

test("Add retains the canonical form, PDF-first flow and previous-reading submission", async () => {
  const h = harness();
  const page = await h.load(`${route}/new/page.tsx`).default({ searchParams: Promise.resolve({}) });
  const component = h.load(`${route}/_components/common-water-bill-form.tsx`).CommonWaterBillForm;
  assert.equal(page.type, component);
  const html = renderToStaticMarkup(page);
  assert.match(html, /Step 1 of 2/);
  assert.match(html, /<input(?=[^>]*name="source_pdf")(?=[^>]*required="")[^>]*>/);
  assert.match(html, /type="hidden"[^>]*name="previous_reading"/);
  assert.match(html, /Continue/);
  assert.match(html, /Save Sedapal Bill/);
  assert.doesNotMatch(html, /Service Month|Charge Month/);
  const ledger = readFileSync(path.join(root, route, "_components/water-ledger-workspace.tsx"), "utf8");
  assert.match(ledger, /<CommonWaterBillForm/);
  assert.match(ledger, /onCancel=\{closeModal\}/);
  assert.match(ledger, /onSuccess=\{handleSuccess\}/);
});

test("correction date retains August service, September charge and October obligations", () => {
  const h = harness();
  const dates = h.load("lib/water-dates.ts");
  const month = h.load("server/water/month.ts");
  const service = dates.getServiceMonthFromReadingDate(fixture.bill_date);
  assert.equal(dates.formatMonthYear(service), "Aug 2026");
  assert.equal(dates.formatMonthYear(dates.getChargeMonthFromServiceMonth(service)), "Sep 2026");
  assert.equal(month.getAppliedObligationMonthFromReadingDate(fixture.bill_date), "2026-10");
});
