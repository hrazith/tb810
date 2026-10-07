import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// TB810 date contract: operators read/type DD/MM/YYYY, forms submit YYYY-MM-DD.
// Browser interaction (typing, clicking days) is not automatable with the
// repo's Node test stack, so the parser/state contract the component runs on
// is tested directly and the component is verified through server rendering.
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

const dates = loadModule("lib/calendar-date.ts");
const { formatPeruvianDate } = loadModule("lib/water-dates.ts");
// Phosphor ships CommonJS files inside an ES-module package, which this harness
// cannot load; icons are stubbed as in the other UI tests.
const iconStub = (name) => {
  const Icon = (props) => React.createElement("svg", { "data-icon": name, "aria-hidden": props["aria-hidden"] });
  Icon.displayName = `IconStub(${name})`;
  return Icon;
};
const icons = { CalendarBlank: iconStub("calendar"), CaretLeft: iconStub("caret-left"), CaretRight: iconStub("caret-right") };
const { DateInput, evaluateDateText, buildCalendarMonth, defaultDateInputLabels } = loadModule("components/ui/date-input.tsx", {
  "@phosphor-icons/react/dist/ssr": icons,
});

const render = (props) => renderToStaticMarkup(React.createElement(DateInput, props));

test("canonical YYYY-MM-DD displays as DD/MM/YYYY", () => {
  assert.equal(dates.formatCalendarDate("2026-10-06"), "06/10/2026");
  assert.equal(dates.formatCalendarDate("2026-01-02"), "02/01/2026");
  assert.equal(dates.formatCalendarDate("2028-02-29"), "29/02/2028");
  assert.equal(dates.formatCalendarDate(""), null);
  assert.equal(dates.formatCalendarDate("2026-02-31"), null, "never rolled over to March");
});

test("manual DD/MM/YYYY entry parses explicitly and only to real dates", () => {
  assert.equal(dates.parseDisplayDate("06/10/2026"), "2026-10-06", "06/10 is 6 October, never June 10");
  assert.equal(dates.parseDisplayDate("02/01/2026"), "2026-01-02");
  assert.equal(dates.parseDisplayDate("29/02/2028"), "2028-02-29");
  for (const invalid of ["31/02/2026", "29/02/2027", "00/10/2026", "12/13/2026", "6/10/2026", "2026-10-06", "06/10/26", "06-10-2026", "", "dd/mm/yyyy"]) {
    assert.equal(dates.parseDisplayDate(invalid), null, invalid);
  }
});

test("the entry mask inserts separators without reordering day and month", () => {
  assert.equal(dates.maskDisplayDate("06102026"), "06/10/2026");
  assert.equal(dates.maskDisplayDate("0610"), "06/10");
  assert.equal(dates.maskDisplayDate("061"), "06/1");
  assert.equal(dates.maskDisplayDate("06/10/2026"), "06/10/2026");
  assert.equal(dates.maskDisplayDate("06/10/20261"), "06/10/2026", "at most eight digits");
});

test("the shared formatter agrees with Water's formatPeruvianDate on every real date 2020-2030", () => {
  let day = "2020-01-01";
  let checked = 0;
  while (day <= "2030-12-31") {
    assert.equal(dates.formatCalendarDate(day), formatPeruvianDate(day), day);
    assert.equal(dates.parseDisplayDate(dates.formatCalendarDate(day)), day, `round trip ${day}`);
    day = dates.addCalendarDays(day, 1);
    checked += 1;
  }
  assert.equal(checked, 4018);
});

test("calendar-date handling never shifts a day under any process timezone", () => {
  const script = `
    const ts = require(${JSON.stringify(requireFromRoot.resolve("typescript"))});
    const fs = require("node:fs");
    const code = ts.transpileModule(fs.readFileSync(${JSON.stringify(path.join(root, "lib/calendar-date.ts"))}, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const m = { exports: {} };
    new Function("module", "exports", code)(m, m.exports);
    const d = m.exports;
    process.stdout.write(JSON.stringify([
      d.formatCalendarDate("2026-10-06"), d.parseDisplayDate("06/10/2026"), d.addCalendarDays("2026-12-31", 1),
      d.addCalendarDays("2028-03-01", -1), d.weekdayIndex("2026-10-01"), d.formatCalendarDate("2026-01-01"),
    ]));
  `;
  const expected = ["06/10/2026", "2026-10-06", "2027-01-01", "2028-02-29", 3, "01/01/2026"];
  for (const tz of ["America/Lima", "UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Tokyo"]) {
    const run = spawnSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), expected, `TZ=${tz}`);
  }
});

test("visible text decides the submitted value; invalid or partial text never submits a date", () => {
  assert.deepEqual(evaluateDateText(""), { value: "", message: "" });
  assert.deepEqual(evaluateDateText("06/10/2026"), { value: "2026-10-06", message: "" });
  // A previously valid 06/10/2026 edited into an impossible date yields "", not the stale 2026-10-06.
  assert.deepEqual(evaluateDateText("31/02/2026"), { value: "", message: defaultDateInputLabels.invalidDate });
  assert.deepEqual(evaluateDateText("06/10/2"), { value: "", message: defaultDateInputLabels.invalidDate });
});

test("min and max bound the submitted value", () => {
  const range = { min: "2026-10-01", max: "2026-10-31" };
  assert.equal(evaluateDateText("01/10/2026", range).value, "2026-10-01");
  assert.equal(evaluateDateText("31/10/2026", range).value, "2026-10-31");
  const before = evaluateDateText("30/09/2026", range);
  assert.deepEqual(before, { value: "", message: "Enter a date on or after 01/10/2026." });
  const after = evaluateDateText("01/11/2026", range);
  assert.deepEqual(after, { value: "", message: "Enter a date on or before 31/10/2026." });
});

test("the calendar grid is Monday-first and every day selects its exact ISO value", () => {
  const weeks = buildCalendarMonth(2026, 10);
  assert.deepEqual(weeks[0], [null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"], "1 October 2026 is a Thursday");
  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, 31);
  for (const iso of days) {
    // Selecting a day commits its DD/MM/YYYY text, which must evaluate back to the same ISO date.
    assert.equal(evaluateDateText(dates.formatCalendarDate(iso)).value, iso);
  }
  assert.equal(buildCalendarMonth(2028, 2).flat().filter(Boolean).at(-1), "2028-02-29");
  assert.equal(dates.addCalendarDays("2026-10-06", 7), "2026-10-13", "keyboard week step");
});

test("a populated field shows DD/MM/YYYY and submits YYYY-MM-DD under its name", () => {
  const html = render({ name: "reading_date", value: "2026-10-06", onValueChange: () => {} });
  assert.match(html, /<input[^>]*type="text"[^>]*value="06\/10\/2026"/);
  assert.match(html, /<input type="hidden" name="reading_date" value="2026-10-06"\/>/);
  assert.equal((html.match(/name="reading_date"/g) ?? []).length, 1, "exactly one submitted field");
  assert.doesNotMatch(html, /type="date"/);
  assert.match(html, /placeholder="dd\/mm\/yyyy"/);
});

test("an empty field shows the dd/mm/yyyy placeholder and submits nothing", () => {
  const html = render({ name: "reading_date", value: "", onValueChange: () => {} });
  assert.match(html, /<input(?=[^>]*type="text")(?=[^>]*placeholder="dd\/mm\/yyyy")(?=[^>]*value="")[^>]*>/);
  assert.match(html, /<input type="hidden" name="reading_date" value=""\/>/);
});

test("an impossible controlled value is not displayed or submitted as a different date", () => {
  const html = render({ name: "bill_date", value: "2026-02-31", onValueChange: () => {} });
  assert.doesNotMatch(html, /03\/03\/2026|2026-03-03/);
  assert.match(html, /<input type="hidden" name="bill_date" value=""\/>/);
});

test("required, disabled, readOnly, form and accessible labelling reach the right elements", () => {
  const required = render({ name: "reading_date", value: "", required: true, form: "row-form", "aria-label": "Reading date for Unit 201" });
  assert.match(required, /<input(?=[^>]*type="text")(?=[^>]*form="row-form")(?=[^>]*required="")(?=[^>]*aria-label="Reading date for Unit 201")[^>]*>/);
  assert.match(required, /<input(?=[^>]*type="hidden")(?=[^>]*name="reading_date")(?=[^>]*form="row-form")(?=[^>]*value="")[^>]*\/>/);
  assert.match(required, /<button type="button" aria-label="Choose date" aria-haspopup="dialog" aria-expanded="false"/);
  assert.match(required, /data-icon="calendar"/, "calendar trigger keeps its icon");

  const disabled = render({ name: "reading_date", value: "2026-10-06", disabled: true });
  assert.match(disabled, /<input[^>]*type="text"[^>]*disabled=""/);
  assert.match(disabled, /<input(?=[^>]*type="hidden")(?=[^>]*name="reading_date")(?=[^>]*value="2026-10-06")(?=[^>]*disabled="")[^>]*\/>/, "disabled fields do not submit");
  assert.match(disabled, /<button[^>]*aria-label="Choose date"[^>]*disabled=""/);

  const readOnly = render({ name: "reading_date", value: "2026-10-06", readOnly: true });
  assert.match(readOnly, /<input[^>]*type="text"[^>]*readonly=""/i, "HTML attribute names are case-insensitive");
  assert.match(readOnly, /<button[^>]*aria-label="Choose date"[^>]*disabled=""/);
});

test("an uncontrolled field honours defaultValue", () => {
  const html = render({ name: "bill_date", defaultValue: "2026-09-05" });
  assert.match(html, /value="05\/09\/2026"/);
  assert.match(html, /<input type="hidden" name="bill_date" value="2026-09-05"\/>/);
});

test("visible wording is replaceable for a future Spanish UI without changing the numeric contract", () => {
  const html = render({ name: "reading_date", value: "2026-10-06", locale: "es-PE", labels: { openCalendar: "Elegir fecha" } });
  assert.match(html, /aria-label="Elegir fecha"/);
  assert.match(html, /value="06\/10\/2026"/);
  assert.match(html, /value="2026-10-06"/);
});

test("appearances reuse the TB810 field styles", () => {
  const filled = render({ value: "" });
  assert.match(filled, /bg-zinc-100/, "filled matches Input");
  const outlined = render({ value: "", appearance: "outlined" });
  assert.match(outlined, /rounded-xl border border-zinc-300 bg-white/, "outlined matches the Sedapal form fields");
});
