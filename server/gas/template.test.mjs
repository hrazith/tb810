import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve(process.cwd()) } });
const { buildGasReadingTemplateRows } = jiti("./template.ts");
const { generateGasReadingTemplate } = jiti("./template-generator.ts");
const { parseGasWorkbook } = jiti("./import.ts");

test("Gas template uses only eligible condos and canonical previous readings", () => {
  const units = [
    { id: "u1", unit_number: "201", unit_type_code: "condo", has_gas_service: true },
    { id: "u2", unit_number: "301", unit_type_code: "condo", has_gas_service: false },
    { id: "u3", unit_number: "P-01", unit_type_code: "parking", has_gas_service: true },
  ];
  const readings = [
    { unit_id: "u1", reading_month: "2026-08-01", current_reading: 275, previous_reading: 270 },
    { unit_id: "u1", reading_month: "2026-07-01", current_reading: 270, previous_reading: 265 },
  ];

  assert.deepEqual(buildGasReadingTemplateRows(units, readings, "2026-09"), [
    { unitNumber: "201", previousReading: 275, currentReading: null, readingDate: null },
  ]);
});

test("generated Gas template has the canonical columns and accepts partial rows", async () => {
  const workbook = generateGasReadingTemplate([
    { unitNumber: "201", previousReading: 275, currentReading: 282, readingDate: "2026-09-16" },
    { unitNumber: "202", previousReading: 100, currentReading: null, readingDate: null },
  ]);
  const summary = await parseGasWorkbook(new File([workbook], "gas-readings-2026-09.xlsx"));

  assert.equal(summary.invalidRows.length, 0);
  assert.equal(summary.unmatchedRows.length, 0);
  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].data.Unit, "201");
  assert.equal(summary.rows[0].data["Current Reading"], "282");
  assert.equal(summary.rows[0].data["Reading Date"], "2026-09-16");
});

test("Gas template generator remains an XLSX workbook", () => {
  const workbook = generateGasReadingTemplate([]);
  assert.equal(workbook.subarray(0, 2).toString(), "PK");
  assert.ok(readFileSync(new URL("./template-generator.ts", import.meta.url), "utf8").includes("generateSpreadsheetTemplate"));
});
