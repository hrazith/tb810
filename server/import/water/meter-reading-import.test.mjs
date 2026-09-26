import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd()) },
});

const { generateMeterReadingTemplate } = jiti("@/server/import/excel/meter-reading-template-generator.ts");
const { parseMeterReadingTemplateWorkbook } = jiti("@/server/import/excel/meter-reading-template.ts");

function operationalWorkbook() {
  const directory = mkdtempSync(path.join(tmpdir(), "tb810-water-template-test-"));
  const source = path.join(directory, "source.xlsx");
  const unpacked = path.join(directory, "unpacked");
  const output = path.join(directory, "operational.xlsx");
  writeFileSync(source, generateMeterReadingTemplate(["201", "202"]));
  execFileSync("unzip", ["-q", source, "-d", unpacked]);
  writeFileSync(
    path.join(unpacked, "xl/worksheets/sheet1.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Edificio ID</t></is></c><c r="B1" t="inlineStr"><is><t>Unidad ID</t></is></c><c r="C1" t="inlineStr"><is><t>Fecha de Lectura</t></is></c><c r="D1" t="inlineStr"><is><t>Mes de Consumo</t></is></c><c r="E1" t="inlineStr"><is><t>Unidad</t></is></c><c r="F1" t="inlineStr"><is><t>Lectura</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>other-building</t></is></c><c r="B2" t="inlineStr"><is><t>other-unit</t></is></c><c r="C2"><v>46281</v></c><c r="D2" t="inlineStr"><is><t>09/2026</t></is></c><c r="E2" t="inlineStr"><is><t>DEP-201</t></is></c><c r="F2"><v>12000</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>other-building</t></is></c><c r="B3" t="inlineStr"><is><t>other-unit</t></is></c><c r="C3" t="inlineStr"><is><t>2026-09-17</t></is></c><c r="D3" t="inlineStr"><is><t>2026-09</t></is></c><c r="E3" t="inlineStr"><is><t>202</t></is></c><c r="F3"><v>13000</v></c></row></sheetData></worksheet>',
  );
  execFileSync("zip", ["-qr", output, "."], { cwd: unpacked });
  const workbook = new File([readFileSync(output)], "operational.xlsx");
  rmSync(directory, { recursive: true, force: true });
  return workbook;
}

function namespacedWorkbook() {
  const directory = mkdtempSync(path.join(tmpdir(), "tb810-water-namespaced-test-"));
  const source = path.join(directory, "source.xlsx");
  const unpacked = path.join(directory, "unpacked");
  const output = path.join(directory, "namespaced.xlsx");
  writeFileSync(source, generateMeterReadingTemplate(["201", "202"]));
  execFileSync("unzip", ["-q", source, "-d", unpacked]);

  const prefixTags = (xml, tags) =>
    tags.reduce((value, tag) => value.replaceAll(`<${tag}`, `<x:${tag}`).replaceAll(`</${tag}>`, `</x:${tag}>`), xml);
  const workbookPath = path.join(unpacked, "xl/workbook.xml");
  const worksheetPath = path.join(unpacked, "xl/worksheets/sheet1.xml");
  writeFileSync(workbookPath, prefixTags(readFileSync(workbookPath, "utf8"), ["workbook", "sheets", "sheet"]));
  writeFileSync(worksheetPath, prefixTags(readFileSync(worksheetPath, "utf8"), ["worksheet", "sheetData", "row", "c", "is", "v"]));
  writeFileSync(
    path.join(unpacked, "xl/sharedStrings.xml"),
    '<?xml version="1.0" encoding="utf-8"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:t>Unidad</x:t></x:si><x:si><x:t>Lectura</x:t></x:si></x:sst>',
  );
  const relsPath = path.join(unpacked, "xl/_rels/workbook.xml.rels");
  writeFileSync(
    relsPath,
    readFileSync(relsPath, "utf8").replace('Target="worksheets/sheet1.xml"', 'Target="/xl/worksheets/sheet1.xml"'),
  );

  execFileSync("zip", ["-qr", output, "."], { cwd: unpacked });
  const workbook = new File([readFileSync(output)], "lecturas_filled_test.xlsx");
  rmSync(directory, { recursive: true, force: true });
  return workbook;
}

test("generated Unit Water template contains the canonical headers and eligible roster", async () => {
  const workbook = generateMeterReadingTemplate(Array.from({ length: 64 }, (_, index) => String(index + 201)));
  const file = new File([workbook], "lecturas.xlsx");
  const summary = await parseMeterReadingTemplateWorkbook(file);

  assert.deepEqual(summary.selectedWorksheet.canonicalColumns, ["Unit", "Reading"]);
  assert.equal(summary.selectedWorksheet.rowCount, 64);
  assert.equal(summary.selectedWorksheet.parsedRows.length, 64);
  assert.equal(summary.selectedWorksheet.parsedRows[0].unitNumber, "201");
  assert.equal(summary.selectedWorksheet.parsedRows[0].readingEnd, null);
  assert.equal(summary.selectedWorksheet.blankReadingCount, 64);
  assert.deepEqual(summary.selectedWorksheet.mappedColumns, { Unit: "Unidad", Reading: "Lectura" });
});

test("operational workbook ignores administrative columns and parses dates and month", async () => {
  const summary = await parseMeterReadingTemplateWorkbook(operationalWorkbook());
  assert.equal(summary.selectedWorksheet.parsedRows.length, 2);
  assert.equal(summary.selectedWorksheet.parsedRows[0].unitNumber, "201");
  assert.equal(summary.selectedWorksheet.parsedRows[0].readingEnd, 12000);
  assert.equal(summary.selectedWorksheet.parsedRows[0].readingDate, "2026-09-16");
  assert.equal(summary.selectedWorksheet.parsedRows[0].consumptionMonth, "2026-09");
  assert.equal(summary.selectedWorksheet.parsedRows[1].readingDate, "2026-09-17");
  assert.equal(summary.selectedWorksheet.parsedRows[1].consumptionMonth, "2026-09");
});

test("namespaced Excel workbook with absolute worksheet relationship parses successfully", async () => {
  const summary = await parseMeterReadingTemplateWorkbook(namespacedWorkbook());
  assert.equal(summary.selectedWorksheet.rowCount, 2);
  assert.equal(summary.selectedWorksheet.parsedRows[0].unitNumber, "201");
  assert.equal(summary.selectedWorksheet.parsedRows[0].readingEnd, null);
  assert.equal(summary.selectedWorksheet.blankReadingCount, 2);
});

test("primary intake persistence contract is preview then explicit confirmation", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("app/(staff)/water/unit-meter-readings/actions.ts", "utf8"));

  assert.match(source, /return \{\s*summary,\s*validation,/s);
  assert.match(source, /confirmCompletedTemplateAction/);
  assert.match(source, /persistMeterReadingImport\(monthKey, validation\.acceptedRows, readingDate/);
  assert.doesNotMatch(source.slice(source.indexOf("export async function uploadCompletedTemplateAction"), source.indexOf("export async function confirmCompletedTemplateAction")), /persistMeterReadingImport/);
});

test("active Unit Water ledger uses projected rows for direct entry", async () => {
  const page = await import("node:fs/promises").then((fs) => fs.readFile("app/(staff)/water/unit-meter-readings/_components/unit-meter-readings-month-page.tsx", "utf8"));
  const row = await import("node:fs/promises").then((fs) => fs.readFile("app/(staff)/water/unit-meter-readings/_components/expected-meter-reading-row.tsx", "utf8"));

  assert.doesNotMatch(page, /AddMeterReadingRow/);
  assert.match(page, /ExpectedMeterReadingRow/);
  assert.match(page, /createInlineUnitMeterReadingAction/);
  assert.match(row, /name="reading_end"/);
  assert.match(row, /name="reading_date"/);
  assert.match(row, /name="reading_start"/);
  assert.match(row, /action: \(prevState: FormState/);
});

test("confirmation persistence invokes Supabase RPC with its client receiver", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("server/import/water/meter-reading-import-persistence.ts", "utf8"));

  assert.match(source, /const client = supabase as unknown as/);
  assert.match(source, /await client\.rpc\(/);
  assert.doesNotMatch(source, /const rpc = supabase\.rpc[\s\S]*?await rpc\(/);
});

test("DEV import RPC qualifies canonical import result counts", async () => {
  const migration = await import("node:fs/promises").then((fs) => fs.readFile("supabase/migrations/20260924130000_fix_unit_water_import_rpc.sql", "utf8"));

  assert.match(migration, /select result\.inserted_count, result\.updated_count, result\.processed_count/);
  assert.doesNotMatch(migration, /select inserted_count, updated_count, processed_count\s+into v_inserted_count/);
});
