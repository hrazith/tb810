import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// Water calendar dates display DD/MM/YYYY. Month/period labels are separate.
const root = process.cwd();
const requireFromRoot = createRequire(path.join(root, "package.json"));
const React = requireFromRoot("react");
const { renderToStaticMarkup } = requireFromRoot("react-dom/server");

function loadModule(file, mocks = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    // Read before caching so a failed extension probe never leaves an empty module.
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

const { formatPeruvianDate } = loadModule("lib/water-dates.ts");

// Phosphor ships CommonJS files inside an ES-module package, which this harness
// cannot load; icons are stubbed as in the other UI tests.
const iconStub = (name) => {
  const Icon = () => React.createElement("svg", { "data-icon": name });
  Icon.displayName = `IconStub(${name})`;
  return Icon;
};
const icons = new Proxy({}, { get: (_target, name) => iconStub(String(name)) });

test("Water calendar dates display as DD/MM/YYYY", () => {
  assert.equal(formatPeruvianDate("2026-09-05"), "05/09/2026");
  assert.equal(formatPeruvianDate("2026-01-02"), "02/01/2026");
  assert.equal(formatPeruvianDate("2026-12-31"), "31/12/2026");
  assert.equal(formatPeruvianDate("2024-02-29"), "29/02/2024");
});

test("Water calendar dates never shift a day under any process timezone", () => {
  const dates = ["2026-09-05", "2026-01-02", "2026-01-01", "2026-12-31", "2024-02-29"];
  const script = `
    const ts = require(${JSON.stringify(requireFromRoot.resolve("typescript"))});
    const fs = require("node:fs");
    const code = ts.transpileModule(fs.readFileSync(${JSON.stringify(path.join(root, "lib/water-dates.ts"))}, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const mod = { exports: {} };
    new Function("module", "exports", code)(mod, mod.exports);
    process.stdout.write(JSON.stringify(${JSON.stringify(dates)}.map((d) => mod.exports.formatPeruvianDate(d))));
  `;
  const expected = ["05/09/2026", "02/01/2026", "01/01/2026", "31/12/2026", "29/02/2024"];
  for (const tz of ["America/Lima", "UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Tokyo"]) {
    const run = spawnSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), expected, `TZ=${tz}`);
  }
});

test("invalid values are returned unchanged rather than reinterpreted", () => {
  assert.equal(formatPeruvianDate("not-a-date"), "not-a-date");
});

test("the Unit Water reading detail shows the reading date as DD/MM/YYYY", async () => {
  const page = loadModule("app/(staff)/water/unit-meter-readings/[month]/reading/[readingId]/page.tsx", {
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "next/link": { __esModule: true, default: ({ href, children }) => React.createElement("a", { href }, children) },
    "@/server/water/unit-meter-readings": {
      getUnitMeterReadingById: async () => ({
        data: {
          id: "reading-1", unit_number: "201", reading_month_label: "September 2026", reading_date: "2026-09-05",
          reading_end: 1234, previous_reading_label: "1200", consumption: 34, status: "recorded", notes: null,
        },
        error: null,
      }),
    },
  }).default;
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ month: "2026-09", readingId: "reading-1" }) }));
  assert.match(html, /Reading Date<\/p><p class="text-zinc-950">05\/09\/2026<\/p>/);
  assert.doesNotMatch(html, /2026-09-05/);
  assert.match(html, /September 2026/, "month label unchanged");
});

test("the Unit Water form shows the previous reading date as DD/MM/YYYY and submits ISO reading dates", () => {
  const { UnitMeterReadingForm } = loadModule("app/(staff)/water/unit-meter-readings/_components/unit-meter-reading-form.tsx", {
    "@/components/dev-tools": { useDevTools: () => ({ historicalEditingEnabled: false }) },
    "@phosphor-icons/react/dist/ssr": icons,
  });
  const html = renderToStaticMarkup(React.createElement(UnitMeterReadingForm, {
    action: async () => ({}),
    submitLabel: "Save",
    units: [{ id: "unit-1", unit_number: "201", label: "201" }],
    initialValues: { unit_id: "unit-1", reading_date: "2026-09-05" },
    readingDefaults: { readingMonth: "September 2026", readingMonthKey: "2026-09", previousReading: 1200, previousReadingDate: "2026-08-05" },
  }));
  assert.match(html, /value="05\/08\/2026"/);
  assert.match(html, /<input(?=[^>]*type="text")(?=[^>]*value="05\/09\/2026")[^>]*>/, "reading date is entered as DD/MM/YYYY");
  assert.match(html, /<input(?=[^>]*type="hidden")(?=[^>]*name="reading_date")(?=[^>]*value="2026-09-05")[^>]*>/, "and still submits YYYY-MM-DD");
  assert.doesNotMatch(html, /type="date"/);
});

test("Sedapal surfaces render bill dates through the Water calendar formatter", () => {
  for (const file of ["app/(staff)/water/sedapal/_components/water-ledger-workspace.tsx", "app/(staff)/water/sedapal/[utilityBillId]/page.tsx"]) {
    assert.match(readFileSync(path.join(root, file), "utf8"), /formatPeruvianDate\(bill\.bill_date\)/, file);
  }
});

test("canonical Water UI never renders a raw ISO calendar date field", () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".tsx")) files.push(full);
    }
  };
  walk(path.join(root, "app/(staff)/water"));
  // A JSX expression rendering the field directly; template-literal `${...}`
  // interpolation (e.g. sorting by bill_date) is machine use, not display.
  const raw = /(?<!\$)\{\s*[\w.?]*\b(reading_date|bill_date|previous_reading_date|previousReadingDate)\s*(\?\?[^}]*)?\}/;
  const offenders = files.filter((file) => raw.test(readFileSync(file, "utf8").replace(/value=\{[^}]*\}/g, "")));
  assert.deepEqual(offenders.map((file) => path.relative(root, file)), []);
});

const WATER_DATE_INPUTS = [
  ["app/(staff)/water/sedapal/_components/common-water-bill-form.tsx", "bill_date"],
  ["app/(staff)/water/unit-meter-readings/_components/current-meter-reading-row.tsx", "reading_date"],
  ["app/(staff)/water/unit-meter-readings/_components/expected-meter-reading-row.tsx", "reading_date"],
  ["app/(staff)/water/unit-meter-readings/_components/unit-meter-reading-form.tsx", "reading_date"],
  ["app/(staff)/water/unit-meter-readings/_components/upload-completed-template-button.tsx", "reading_date"],
];

test("all five Water date fields use the TB810 DateInput with their canonical field names", () => {
  for (const [file, name] of WATER_DATE_INPUTS) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.match(source, /import \{ DateInput \} from "@\/components\/ui\/date-input";/, file);
    assert.match(source, new RegExp(`<DateInput[^>]*name="${name}"`), `${file} submits ${name}`);
    assert.doesNotMatch(source, /type="date"/, `${file} has no native date input`);
  }
});

const rowMocks = {
  "@/components/dev-tools": { useDevTools: () => ({ historicalEditingEnabled: false }) },
  "@phosphor-icons/react/dist/ssr": icons,
};

test("screenshot case: a Unit Water row dated 2026-10-06 shows 06/10/2026, never 10/06/2026", () => {
  const { CurrentMeterReadingRow } = loadModule("app/(staff)/water/unit-meter-readings/_components/current-meter-reading-row.tsx", rowMocks);
  const html = renderToStaticMarkup(React.createElement(CurrentMeterReadingRow, {
    row: { id: "reading-1", unit_id: "unit-1", unit_number: "201", previous_reading: 1200, reading_end: 1234, reading_date: "2026-10-06", notes: null, status: "recorded" },
    action: async () => ({}),
    deleteAction: async () => ({}),
  }));
  assert.match(html, /<input(?=[^>]*type="text")(?=[^>]*value="06\/10\/2026")(?=[^>]*aria-label="Reading date for Unit 201")[^>]*>/);
  assert.match(html, /<input(?=[^>]*type="hidden")(?=[^>]*name="reading_date")(?=[^>]*form="unit-meter-reading-reading-1")(?=[^>]*value="2026-10-06")[^>]*>/);
  assert.doesNotMatch(html, /10\/06\/2026|type="date"/);
  assert.match(html, /aria-label="Choose date"/, "calendar trigger remains available");
});

test("screenshot case: an empty Unit Water row shows the dd/mm/yyyy placeholder", () => {
  const { ExpectedMeterReadingRow } = loadModule("app/(staff)/water/unit-meter-readings/_components/expected-meter-reading-row.tsx", rowMocks);
  const html = renderToStaticMarkup(React.createElement(ExpectedMeterReadingRow, {
    unitNumber: "202", unitId: "unit-2", floor: "2", previousReading: 1100, action: async () => ({}),
  }));
  assert.match(html, /<input(?=[^>]*type="text")(?=[^>]*placeholder="dd\/mm\/yyyy")(?=[^>]*value="")(?=[^>]*aria-label="Reading date for Unit 202")[^>]*>/);
  assert.doesNotMatch(html, /mm\/dd\/yyyy|type="date"/);
  assert.match(html, /aria-label="Choose date"/);
});
