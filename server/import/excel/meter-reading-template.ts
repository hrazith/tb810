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
  const matches = xml.match(/<si[\s\S]*?<\/si>/g) ?? [];
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
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unable to read the Unit Meter Reading template.`);
  }
  return parsed;
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
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relMap.set(match[1], match[2]);
  }

  const sheets: WorkbookSheet[] = [];
  for (const match of workbookXml.matchAll(
    /<sheet\b[^>]*name="([^"]+)"[^>]*sheetId="[^"]+"[^>]*r:id="([^"]+)"[^>]*\/>/g,
  )) {
    const target = relMap.get(match[2]);
    if (!target) continue;
    sheets.push({ name: match[1], path: `xl/${target}` });
  }

  if (!sheets.length) {
    throw new Error("Unable to read the Unit Meter Reading template.");
  }

  return sheets;
}

function parseSheetXml(xml: string, sharedStrings: string[]): SheetParseResult {
  const rowMatches = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
  const rows: { rowNumber: number; cells: ParsedCell[] }[] = [];

  for (const rowXml of rowMatches) {
    const rowNumber = Number(getAttribute(rowXml, "r") ?? "0");
    const cellMatches = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) ?? [];
    const cells: ParsedCell[] = [];

    for (const cellXml of cellMatches) {
      const ref = getAttribute(cellXml, "r") ?? "";
      const type = getAttribute(cellXml, "t");
      const inlineMatch = cellXml.match(/<is>([\s\S]*?)<\/is>/);
      const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
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
    const unitNumber = normalizeUnitValue(rawUnit);
    if (!unitNumber) {
      throw new Error("Unable to read the Unit Meter Reading template.");
    }

    const readingEnd = parseReadingValue(rawReading);
    if (rawReading == null || rawReading.trim() === "") {
      blankReadingCount += 1;
    }

    parsedRows.push({
      sourceRowNumber: row.rowNumber,
      unitNumber,
      readingEnd,
    });
  }

  return {
    name: "Worksheet",
    parsedRows,
    blankReadingCount,
    mappedColumns: {
      Unit: "Unidad",
      Reading: "Lectura",
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
        parsedRows: summary.parsedRows.slice(0, 5),
        blankReadingCount: summary.blankReadingCount,
      },
    };
  } catch {
    throw new Error("Unable to read the Unit Meter Reading template.");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
