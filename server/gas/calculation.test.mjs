import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { calculateGasCharges } = jiti("./calculation.ts");
const workbookPath = resolve("legacy/data/gas/ConsumoDeGas-25-26-USAR.xlsx");

function unzip(innerPath) {
  const result = spawnSync("unzip", ["-p", workbookPath, innerPath], {
    encoding: "utf8",
    maxBuffer: 60 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Unable to read ${innerPath} from workbook.`);
  }
  return result.stdout;
}

function parseSharedStrings() {
  const xml = unzip("xl/sharedStrings.xml");
  const strings = [];
  const pattern = /<si[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/si>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    strings.push(
      match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'"),
    );
  }
  return strings;
}

const sharedStrings = parseSharedStrings();

function readWorkbookRow(sheetPath, rowNumber) {
  const xml = unzip(sheetPath);
  const rowMatch = xml.match(new RegExp(`<row[^>]*r="${rowNumber}"[^>]*>([\\s\\S]*?)</row>`));
  if (!rowMatch) return [];

  const cells = [];
  const cellPattern = /<c[^>]*r="([A-Z]+\d+)"(?:[^>]*t="(\w+)")?[^>]*>([\s\S]*?)<\/c>/g;
  let cellMatch;
  while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
    const [, ref, type, cellXml] = cellMatch;
    const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
    const formulaMatch = cellXml.match(/<f[^>]*>([\s\S]*?)<\/f>/);
    let value = valueMatch ? valueMatch[1] : "";
    if (type === "s") {
      value = sharedStrings[Number(value)] ?? "";
    }
    cells.push({
      ref,
      value,
      formula: formulaMatch?.[1] ?? null,
    });
  }
  return cells;
}

function cellValue(cells, ref) {
  return cells.find((cell) => cell.ref === ref)?.value ?? "";
}

function workbookJuly2026Fixture() {
  const calcRows = Array.from({ length: 60 }, (_, index) => index + 6);
  const units = calcRows
    .map((rowNumber) => {
      const cells = readWorkbookRow("xl/worksheets/sheet1.xml", rowNumber);
      const unitNumber = String(Number(cellValue(cells, `C${rowNumber}`)));
      const consumption = cellValue(cells, `BD${rowNumber}`);
      const amount = cellValue(cells, `BE${rowNumber}`);
      return {
        unitId: `wb-${unitNumber}-${rowNumber}`,
        unitNumber,
        unitTypeCode: "condo",
        hasGasService: unitNumber !== "301",
        readingMonth: "2026-07",
        consumption: unitNumber === "301" || consumption === "" ? null : consumption,
        workbookAmount: amount,
      };
    })
    .filter((unit) => unit.consumption != null || unit.unitNumber === "301");

  return {
    sourceReadingMonth: "2026-07",
    obligationMonth: "2026-08",
    supplierBills: [
      { billId: "gas-bill-108", amount: "460", status: "unprocessed" },
      { billId: "gas-bill-109", amount: "460", status: "unprocessed" },
      { billId: "gas-bill-110", amount: "460", status: "unprocessed" },
      { billId: "gas-bill-111", amount: "460", status: "unprocessed" },
      { billId: "gas-bill-112", amount: "460", status: "unprocessed" },
      { billId: "gas-bill-113", amount: "460", status: "unprocessed" },
    ],
    units,
  };
}

function makeUnit(overrides = {}) {
  return {
    unitId: "unit-1",
    unitNumber: "101",
    unitTypeCode: "condo",
    hasGasService: true,
    readingMonth: "2026-07",
    consumption: "10.000",
    ...overrides,
  };
}

function makeResult(overrides = {}) {
  return calculateGasCharges({
    sourceReadingMonth: "2026-07",
    obligationMonth: "2026-08",
    supplierBills: [
      { billId: "bill-1", amount: "100.00", status: "unprocessed" },
      { billId: "bill-2", amount: "25.50", status: "processed" },
      { billId: "bill-3", amount: "49.75", status: "unprocessed" },
    ],
    units: [
      makeUnit(),
      makeUnit({ unitId: "unit-2", unitNumber: "102", consumption: "0.000" }),
      makeUnit({ unitId: "unit-3", unitNumber: "103", consumption: "15.000" }),
      { unitId: "park-1", unitNumber: "P-01", unitTypeCode: "parking", hasGasService: false, consumption: null },
      { unitId: "store-1", unitNumber: "S-01", unitTypeCode: "storage", hasGasService: false, consumption: null },
      makeUnit({ unitId: "unit-4", unitNumber: "104", consumption: null }),
    ],
    ...overrides,
  });
}

test("normal complete calculation includes multiple bills and units", () => {
  const result = makeResult({
    units: [
      makeUnit({ unitId: "unit-1", unitNumber: "101", consumption: "10.000" }),
      makeUnit({ unitId: "unit-2", unitNumber: "102", consumption: "0.000" }),
      makeUnit({ unitId: "unit-3", unitNumber: "103", consumption: "15.000" }),
    ],
  });

  assert.equal(result.gasCostPool, "149.75");
  assert.equal(result.totalConsumption, "25.000");
  assert.equal(result.blendedRate, "5.990000");
  assert.equal(result.unitCharges.length, 3);
  assert.equal(result.unitCharges[0].amount, "59.90");
  assert.equal(result.unitCharges[1].amount, "0.00");
  assert.equal(result.unitCharges[2].amount, "89.85");
});

test("missing reading is reported explicitly", () => {
  const result = makeResult({
    units: [
      makeUnit({ unitId: "unit-1", unitNumber: "101", consumption: "10.000" }),
      makeUnit({ unitId: "unit-2", unitNumber: "102", consumption: null }),
    ],
  });

  assert.ok(result.blockers.includes("Required gas readings are missing."));
  assert.equal(result.missingUnits.length, 1);
  assert.equal(result.missingUnits[0].unitNumber, "102");
  assert.equal(result.blendedRate, null);
});

test("zero total building consumption blocks division", () => {
  const result = makeResult({
    units: [
      makeUnit({ unitId: "unit-1", unitNumber: "101", consumption: "0.000" }),
      makeUnit({ unitId: "unit-2", unitNumber: "102", consumption: "0.000" }),
    ],
  });

  assert.ok(result.blockers.includes("Total gas consumption is zero."));
  assert.equal(result.blendedRate, null);
});

test("unit not enrolled in Gas is excluded", () => {
  const result = makeResult({
    units: [
      makeUnit({ unitId: "unit-1", unitNumber: "101", consumption: "10.000" }),
      { unitId: "park-1", unitNumber: "P-01", unitTypeCode: "parking", hasGasService: false, consumption: null },
    ],
  });

  assert.equal(result.excludedUnits.length, 1);
  assert.equal(result.excludedUnits[0].unitNumber, "P-01");
});

test("deterministic repeated calculation returns the same result", () => {
  const first = makeResult({
    units: [
      makeUnit({ unitId: "unit-1", unitNumber: "101", consumption: "10.000" }),
      makeUnit({ unitId: "unit-2", unitNumber: "102", consumption: "15.000" }),
    ],
  });
  const second = makeResult({
    units: [
      makeUnit({ unitId: "unit-1", unitNumber: "101", consumption: "10.000" }),
      makeUnit({ unitId: "unit-2", unitNumber: "102", consumption: "15.000" }),
    ],
  });

  assert.deepEqual(first, second);
});

test("historical workbook fixture comparison", () => {
  const fixture = workbookJuly2026Fixture();
  const result = calculateGasCharges(fixture);

  assert.equal(result.gasCostPool, "2760.00");
  assert.equal(result.totalConsumption, "127.689");
  assert.equal(result.blendedRate, "21.615018");

  const selected = new Map(result.unitCharges.map((charge) => [charge.unitNumber, charge]));
  assert.equal(selected.get("201")?.consumption, "0.254");
  assert.equal(selected.get("201")?.amount, "5.49");
  assert.equal(selected.get("202")?.consumption, "0.028");
  assert.equal(selected.get("202")?.amount, "0.61");
  assert.equal(selected.get("204")?.consumption, "5.037");
  assert.equal(selected.get("204")?.amount, "108.87");
  assert.equal(selected.get("302")?.consumption, "4.070");
  assert.equal(selected.get("302")?.amount, "87.97");
  assert.equal(selected.get("303")?.consumption, "3.287");
  assert.equal(selected.get("303")?.amount, "71.05");

  assert.equal(result.excludedUnits.filter((unit) => unit.unitNumber === "301").length, 2);
  assert.equal(result.blockers.length, 0);
});
