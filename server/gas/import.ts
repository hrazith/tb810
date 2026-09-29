import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function getEntry(zipPath: string, entry: string) {
  try {
    return execFileSync("unzip", ["-p", zipPath, entry], { encoding: "utf8" });
  } catch {
    return null;
  }
}

function extractText(xml: string) {
  return xml.replace(/<[^>]+>/g, "");
}

function parseSharedStrings(xml: string) {
  return (xml.match(/<(?:[\w.-]+:)?si\b[\s\S]*?<\/(?:[\w.-]+:)?si>/g) ?? []).map((entry) => extractText(entry));
}

function getAttribute(source: string, attribute: string) {
  const match = source.match(new RegExp(`${attribute}="([^"]+)"`));
  return match?.[1] ?? null;
}

function getColumnName(cellRef: string) {
  const match = cellRef.match(/^([A-Z]+)\d+$/i);
  return match ? match[1].toUpperCase() : "";
}

function columnNameToIndex(name: string) {
  let result = 0;
  for (const char of name.toUpperCase()) result = result * 26 + (char.charCodeAt(0) - 64);
  return result - 1;
}

type ParsedCell = { ref: string; value: string | null };
type ParsedRow = { rowNumber: number; cells: ParsedCell[] };

function parseSheetXml(xml: string, sharedStrings: string[]) {
  const rowMatches = xml.match(/<(?:[\w.-]+:)?row\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?row>/g) ?? [];
  const rows: ParsedRow[] = [];
  for (const rowXml of rowMatches) {
    const rowNumber = Number(getAttribute(rowXml, "r") ?? "0");
    const cellMatches = rowXml.match(/<(?:[\w.-]+:)?c\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?c>/g) ?? [];
    const cells: ParsedCell[] = [];
    for (const cellXml of cellMatches) {
      const ref = getAttribute(cellXml, "r") ?? "";
      const type = getAttribute(cellXml, "t");
      const inlineMatch = cellXml.match(/<(?:[\w.-]+:)?is>([\s\S]*?)<\/(?:[\w.-]+:)?is>/);
      const valueMatch = cellXml.match(/<(?:[\w.-]+:)?v>([\s\S]*?)<\/(?:[\w.-]+:)?v>/);
      let value: string | null = null;
      if (type === "s" && valueMatch) value = sharedStrings[Number(valueMatch[1])] ?? null;
      else if (type === "inlineStr" && inlineMatch) value = extractText(inlineMatch[1]) || null;
      else if (valueMatch) value = valueMatch[1];
      cells.push({ ref, value: value?.trim() ?? null });
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function normalizeReadingDate(value: string | null) {
  if (value == null || !value.trim()) return value;
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return text;
  const serial = Number(text);
  if (!Number.isFinite(serial) || serial <= 0) return text;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000).toISOString().slice(0, 10);
}

function normalizeHeader(value: string | null) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export type GasImportRow = {
  sourceRowNumber: number;
  kind: "bill" | "reading";
  data: Record<string, string | null>;
};

export type GasImportIssue = {
  sourceRowNumber: number;
  reason: string;
};

export type GasImportPreflight = {
  rows: GasImportRow[];
  unmatchedRows: GasImportIssue[];
  invalidRows: GasImportIssue[];
  duplicateRows: GasImportIssue[];
  unresolvedUnitNumbers: GasImportIssue[];
  expectedUnitCount?: number;
  missingUnitNumbers?: string[];
  readingSheetDetected?: boolean;
  readyToImport?: boolean;
};

export async function parseGasWorkbook(file: File, fallbackReadingDate = "") {
  const buffer = Buffer.from(await file.arrayBuffer());
  const tmpDir = mkdtempSync(join(tmpdir(), "tb810-gas-import-"));
  const tmp = join(tmpDir, file.name);
  writeFileSync(tmp, buffer);
  const workbookXml = getEntry(tmp, "xl/workbook.xml");
  const relsXml = getEntry(tmp, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = getEntry(tmp, "xl/sharedStrings.xml");
  if (!workbookXml || !relsXml) throw new Error("Unable to read workbook.");
  const relMap = new Map<string, string>();
  for (const match of relsXml.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/g)) {
    const attributes = match[1];
    const id = getAttribute(attributes, "Id");
    const target = getAttribute(attributes, "Target");
    if (id && target) relMap.set(id, target);
  }
  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)\/?\s*>/g)) {
    const attributes = match[1];
    const name = getAttribute(attributes, "name");
    const relationshipId = getAttribute(attributes, "id");
    const target = relationshipId ? relMap.get(relationshipId) : null;
    if (!name || !target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    sheets.push({ name, path });
  }
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const rows: GasImportRow[] = [];
  const seenRows = new Set<string>();
  const duplicateRows: GasImportIssue[] = [];
  const unmatchedRows: GasImportIssue[] = [];
  const invalidRows: GasImportIssue[] = [];
  const unresolvedUnitNumbers: GasImportIssue[] = [];
  let readingSheetDetected = false;
  for (const sheet of sheets) {
    const xml = getEntry(tmp, sheet.path);
    if (!xml) continue;
    const parsed = parseSheetXml(xml, sharedStrings);
    const headersRow = parsed.find((row) => row.cells.some((cell) => normalizeHeader(cell.value)));
    if (!headersRow) continue;
    const headers = new Map<number, string>();
    for (const cell of headersRow.cells) {
      const header = cell.value ?? "";
      headers.set(columnNameToIndex(getColumnName(cell.ref)), header);
    }
    const dataRows = parsed.filter((row) => row.rowNumber > headersRow.rowNumber);
    for (const row of dataRows) {
      const data: Record<string, string | null> = {};
      for (const cell of row.cells) {
        const header = headers.get(columnNameToIndex(getColumnName(cell.ref)));
        if (header) data[header] = cell.value ?? null;
      }
      for (const dateHeader of ["Reading Date", "Fecha", "Date"]) {
        if (dateHeader in data) data[dateHeader] = normalizeReadingDate(data[dateHeader]);
      }
      const values = Object.values(data).filter(Boolean).join(" ").toLowerCase();
      const headersInSheet = Array.from(headers.values()).map(normalizeHeader);
      const isReadingSheet = headersInSheet.some((header) => ["unit", "unidad", "unit number"].includes(header)) &&
        headersInSheet.some((header) => ["current reading", "lectura", "reading"].includes(header));
      if (isReadingSheet) readingSheetDetected = true;
      const isBillSheet = headersInSheet.some((header) => ["supplier", "supplier name", "proveedor"].includes(header)) &&
        headersInSheet.some((header) => ["invoice number", "invoice", "nro factura"].includes(header));
      const readingDate = data["Reading Date"] ?? data["Fecha"] ?? data["Date"];
      const currentReading = data["Current Reading"] ?? data["Lectura"] ?? data["Reading"];
      if (isReadingSheet && !hasText(readingDate) && !hasText(currentReading) && !hasText(fallbackReadingDate)) continue;
      const signature = `${sheet.name}:${row.rowNumber}:${values}`;
      if (seenRows.has(signature)) {
        duplicateRows.push({ sourceRowNumber: row.rowNumber, reason: `Duplicate workbook row on ${sheet.name}.` });
        continue;
      }
      seenRows.add(signature);
      if (isBillSheet || values.includes("invoice") || values.includes("supplier")) {
        rows.push({ sourceRowNumber: row.rowNumber, kind: "bill", data });
      } else if (isReadingSheet || values.includes("reading") || values.includes("unidad") || values.includes("unit")) {
        rows.push({ sourceRowNumber: row.rowNumber, kind: "reading", data });
      } else {
        unmatchedRows.push({ sourceRowNumber: row.rowNumber, reason: "Row did not match bill or reading import patterns." });
        continue;
      }

      if (values.includes("invoice") || values.includes("supplier")) {
        const supplierName = data["Supplier"] ?? data["Supplier Name"] ?? data["Proveedor"];
        const invoiceNumber = data["Invoice Number"] ?? data["Invoice"] ?? data["Nro Factura"];
        const invoiceDate = data["Invoice Date"] ?? data["Date"] ?? data["Fecha"];
        const amount = data["Amount"] ?? data["Importe"] ?? data["Monto"];
        if (!hasText(supplierName) || !hasText(invoiceNumber) || !hasText(invoiceDate) || !hasText(amount)) {
          invalidRows.push({ sourceRowNumber: row.rowNumber, reason: "Bill row is missing required supplier, invoice, date, or amount fields." });
        }
      } else {
        const unitNumber = data["Unit"] ?? data["Unidad"] ?? data["Unit Number"];
        if (!hasText(unitNumber)) unresolvedUnitNumbers.push({ sourceRowNumber: row.rowNumber, reason: "Reading row is missing a Unit number." });
        if ((!hasText(readingDate) && !hasText(fallbackReadingDate)) || !hasText(currentReading)) {
          invalidRows.push({ sourceRowNumber: row.rowNumber, reason: "Reading row is missing required reading date or current reading fields." });
        }
      }
    }
  }
  rmSync(tmpDir, { recursive: true, force: true });
  return { rows, unmatchedRows, invalidRows, duplicateRows, unresolvedUnitNumbers, readingSheetDetected };
}
