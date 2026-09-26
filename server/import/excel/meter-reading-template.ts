import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type WorkbookSheet = {
  name: string;
  path: string;
};

type ParsedCell = {
  ref: string;
  value: string | null;
};

type ParsedRow = {
  sourceRowNumber: number;
  unitNumber: string;
  readingEnd: number | null;
  readingText: string | null;
  readingDate: string | null;
  readingDateText: string | null;
  consumptionMonth: string | null;
  consumptionMonthText: string | null;
  readingDateColumnPresent: boolean;
  consumptionMonthColumnPresent: boolean;
};

export type ParsedMeterReadingRow = ParsedRow;

export type WorksheetSummary = {
  name: string;
  rowCount: number;
  canonicalColumns: string[];
  mappedColumns: Record<string, string>;
  parsedRows: ParsedMeterReadingRow[];
  blankReadingCount: number;
};

export type WorkbookSummary = {
  fileName: string;
  worksheets: string[];
  selectedWorksheet: WorksheetSummary;
};

type SheetParseResult = {
  rows: { rowNumber: number; cells: ParsedCell[] }[];
};

const CANONICAL_COLUMNS = ["Unit", "Reading"] as const;
const REQUIRED_HEADERS = ["Unidad", "Lectura"] as const;
const READING_DATE_HEADERS = ["fecha de lectura", "fecha lectura"];
const CONSUMPTION_MONTH_HEADERS = ["mes de consumo"];

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
  const matches = xml.match(/<(?:[\w.-]+:)?si\b[\s\S]*?<\/(?:[\w.-]+:)?si>/g) ?? [];
  return matches.map((entry) => extractText(entry));
}

function getAttribute(source: string, attribute: string) {
  const match = source.match(new RegExp(`${attribute}="([^"]+)"`));
  return match?.[1] ?? null;
}

function normalizeHeader(header: string | null) {
  return header?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function normalizeUnitValue(value: string | null) {
  if (value == null) return "";
  const trimmed = value.trim();
  const match = trimmed.match(/^DEP-(.+)$/i);
  return (match?.[1] ?? trimmed).trim();
}

function parseReadingValue(value: string | null) {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateValue(value: string | null) {
  if (value == null || !value.trim()) return { date: null, text: null, invalid: false };
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || toDateKey(date) !== text
      ? { date: null, text, invalid: true }
      : { date: text, text, invalid: false };
  }
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
    return { date: toDateKey(date), text, invalid: false };
  }
  return { date: null, text, invalid: true };
}

function parseConsumptionMonth(value: string | null) {
  if (value == null || !value.trim()) return { month: null, text: null, invalid: false };
  const text = value.trim().toLowerCase();
  const normalized = text.replace(/\s+/g, " ");
  const direct = normalized.match(/^(\d{4})[-\/]([01]\d)$/);
  if (direct) return { month: `${direct[1]}-${direct[2]}`, text: value.trim(), invalid: false };
  const reversed = normalized.match(/^([01]\d)[-\/]((?:19|20)\d{2})$/);
  if (reversed) return { month: `${reversed[2]}-${reversed[1]}`, text: value.trim(), invalid: false };
  const date = parseDateValue(value);
  if (date.date) return { month: date.date.slice(0, 7), text: value.trim(), invalid: false };
  const names: Record<string, string> = {
    enero: "01", february: "02", febrero: "02", march: "03", marzo: "03", april: "04", abril: "04",
    may: "05", mayo: "05", june: "06", junio: "06", july: "07", julio: "07", august: "08", agosto: "08",
    september: "09", septiembre: "09", setiembre: "09", october: "10", octubre: "10", november: "11", noviembre: "11",
    december: "12", diciembre: "12",
  };
  const named = normalized.match(/^([a-záéíóú]+)\s+((?:19|20)\d{2})$/);
  if (named && names[named[1]]) return { month: `${named[2]}-${names[named[1]]}`, text: value.trim(), invalid: false };
  return { month: null, text: value.trim(), invalid: true };
}

function columnNameToIndex(name: string) {
  let result = 0;
  for (const char of name.toUpperCase()) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

function getColumnName(cellRef: string) {
  const match = cellRef.match(/^([A-Z]+)\d+$/i);
  return match ? match[1].toUpperCase() : "";
}

function parseWorkbookSheets(zipPath: string): WorkbookSheet[] {
  const workbookXml = getEntry(zipPath, "xl/workbook.xml");
  const relsXml = getEntry(zipPath, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    throw new Error("Unable to read the Unit Meter Reading template.");
  }

  const relMap = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const attributes = match[1];
    const id = getAttribute(attributes, "Id");
    const target = getAttribute(attributes, "Target");
    if (id && target) relMap.set(id, target);
  }

  const sheets: WorkbookSheet[] = [];
  for (const match of workbookXml.matchAll(
    /<(?:[\w.-]+:)?sheet\b([^>]*)\/?\s*>/g,
  )) {
    const attributes = match[1];
    const name = getAttribute(attributes, "name");
    const relationshipId = getAttribute(attributes, "r:id");
    const target = relationshipId ? relMap.get(relationshipId) : null;
    if (!name || !target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    sheets.push({ name, path });
  }

  if (!sheets.length) {
    throw new Error("Unable to read the Unit Meter Reading template.");
  }

  return sheets;
}

function parseSheetXml(xml: string, sharedStrings: string[]): SheetParseResult {
  const rowMatches = xml.match(/<(?:[\w.-]+:)?row\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?row>/g) ?? [];
  const rows: { rowNumber: number; cells: ParsedCell[] }[] = [];

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

      if (type === "s" && valueMatch) {
        value = sharedStrings[Number(valueMatch[1])] ?? null;
      } else if (type === "inlineStr" && inlineMatch) {
        value = extractText(inlineMatch[1]) || null;
      } else if (valueMatch) {
        value = valueMatch[1];
      }

      cells.push({ ref, value: value?.trim() ?? null });
    }

    rows.push({ rowNumber, cells });
  }

  return { rows };
}

function findWorksheetRows(rows: { rowNumber: number; cells: ParsedCell[] }[]) {
  const headerRow = rows.find((row) => {
    const labels = row.cells.map((cell) => normalizeHeader(cell.value)).filter(Boolean);
    return REQUIRED_HEADERS.every((header) => labels.includes(normalizeHeader(header)));
  });

  if (!headerRow) {
    throw new Error("Unable to read the Unit Meter Reading template.");
  }

  const headerCells = new Map<number, string>();
  for (const cell of headerRow.cells) {
    const columnIndex = columnNameToIndex(getColumnName(cell.ref));
    if (columnIndex >= 0 && cell.value) {
      headerCells.set(columnIndex, cell.value);
    }
  }

  const columnFor = (wanted: string) => {
    const header = Array.from(headerCells.values()).find(
      (value) => normalizeHeader(value) === normalizeHeader(wanted),
    );
    if (!header) {
      throw new Error("Unable to read the Unit Meter Reading template.");
    }
    return header;
  };

  const unitHeader = columnFor("Unidad");
  const readingHeader = columnFor("Lectura");
  const optionalColumn = (headers: string[]) =>
    Array.from(headerCells.values()).find((value) => headers.includes(normalizeHeader(value))) ?? null;
  const readingDateHeader = optionalColumn(READING_DATE_HEADERS);
  const consumptionMonthHeader = optionalColumn(CONSUMPTION_MONTH_HEADERS);

  const dataRows = rows
    .filter((row) => row.rowNumber > headerRow.rowNumber)
    .filter((row) => row.cells.some((cell) => cell.value && cell.value.trim() !== ""));

  const parsedRows: ParsedMeterReadingRow[] = [];
  let blankReadingCount = 0;

  for (const row of dataRows) {
    const valuesByHeader = new Map<string, string | null>();
    for (const cell of row.cells) {
      const columnIndex = columnNameToIndex(getColumnName(cell.ref));
      const header = headerCells.get(columnIndex);
      if (header) {
        valuesByHeader.set(header, cell.value ?? null);
      }
    }

    const rawUnit = valuesByHeader.get(unitHeader) ?? null;
    const rawReading = valuesByHeader.get(readingHeader) ?? null;
    const rawReadingDate = readingDateHeader ? valuesByHeader.get(readingDateHeader) ?? null : null;
    const rawConsumptionMonth = consumptionMonthHeader ? valuesByHeader.get(consumptionMonthHeader) ?? null : null;
    const unitNumber = normalizeUnitValue(rawUnit);
    if (!unitNumber) {
      throw new Error("Unable to read the Unit Meter Reading template.");
    }

    const readingEnd = parseReadingValue(rawReading);
    const parsedReadingDate = parseDateValue(rawReadingDate);
    const parsedConsumptionMonth = parseConsumptionMonth(rawConsumptionMonth);
    if (rawReading == null || rawReading.trim() === "") {
      blankReadingCount += 1;
    }

    parsedRows.push({
      sourceRowNumber: row.rowNumber,
      unitNumber,
      readingEnd,
      readingText: rawReading?.trim() ?? null,
      readingDate: parsedReadingDate.date,
      readingDateText: parsedReadingDate.text,
      consumptionMonth: parsedConsumptionMonth.month,
      consumptionMonthText: parsedConsumptionMonth.text,
      readingDateColumnPresent: Boolean(readingDateHeader),
      consumptionMonthColumnPresent: Boolean(consumptionMonthHeader),
    });
  }

  return {
    name: "Worksheet",
    parsedRows,
    blankReadingCount,
    mappedColumns: {
      Unit: "Unidad",
      Reading: "Lectura",
      ...(readingDateHeader ? { ReadingDate: readingDateHeader } : {}),
      ...(consumptionMonthHeader ? { ConsumptionMonth: consumptionMonthHeader } : {}),
    },
  };
}

function chooseWorksheet(sheets: WorkbookSheet[], zipPath: string) {
  const sharedStringsXml = getEntry(zipPath, "xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];

  const matchingSheets: {
    sheet: WorkbookSheet;
    parsed: SheetParseResult;
  }[] = [];

  for (const sheet of sheets) {
    const sheetXml = getEntry(zipPath, sheet.path);
    if (!sheetXml) continue;

    const parsed = parseSheetXml(sheetXml, sharedStrings);
    const headerRow = parsed.rows.find((row) => {
      const labels = row.cells.map((cell) => normalizeHeader(cell.value)).filter(Boolean);
      return REQUIRED_HEADERS.every((header) => labels.includes(normalizeHeader(header)));
    });

    if (headerRow) {
      matchingSheets.push({ sheet, parsed });
    }
  }

  if (matchingSheets.length !== 1) {
    throw new Error("Unable to read the Unit Meter Reading template.");
  }

  return matchingSheets[0];
}

export async function parseMeterReadingTemplateWorkbook(file: File): Promise<WorkbookSummary> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Unable to read the Unit Meter Reading template.");
  }

  const tempDir = mkdtempSync(join(tmpdir(), "tb810-meter-template-"));
  const tempPath = join(tempDir, file.name);

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    writeFileSync(tempPath, bytes);

    const sheets = parseWorkbookSheets(tempPath);
    const selected = chooseWorksheet(sheets, tempPath);
    const summary = findWorksheetRows(selected.parsed.rows);

    return {
      fileName: file.name,
      worksheets: sheets.map((item) => item.name),
      selectedWorksheet: {
        name: selected.sheet.name,
        rowCount: summary.parsedRows.length,
        canonicalColumns: [...CANONICAL_COLUMNS],
        mappedColumns: summary.mappedColumns,
        parsedRows: summary.parsedRows,
        blankReadingCount: summary.blankReadingCount,
      },
    };
  } catch (error) {
    throw error;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
