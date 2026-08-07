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
  return (xml.match(/<si[\s\S]*?<\/si>/g) ?? []).map((entry) => extractText(entry));
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
  const rowMatches = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
  const rows: ParsedRow[] = [];
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
      if (type === "s" && valueMatch) value = sharedStrings[Number(valueMatch[1])] ?? null;
      else if (type === "inlineStr" && inlineMatch) value = extractText(inlineMatch[1]) || null;
      else if (valueMatch) value = valueMatch[1];
      cells.push({ ref, value: value?.trim() ?? null });
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function normalizeHeader(value: string | null) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

export type GasImportRow = {
  sourceRowNumber: number;
  kind: "bill" | "reading";
  data: Record<string, string | null>;
};

export async function parseGasWorkbookWorkbook(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const tmpDir = mkdtempSync(join(tmpdir(), "tb810-gas-import-"));
  const tmp = join(tmpDir, file.name);
  writeFileSync(tmp, buffer);
  const workbookXml = getEntry(tmp, "xl/workbook.xml");
  const relsXml = getEntry(tmp, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = getEntry(tmp, "xl/sharedStrings.xml");
  if (!workbookXml || !relsXml) throw new Error("Unable to read workbook.");
  const relMap = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relMap.set(match[1], match[2]);
  }
  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)) {
    const target = relMap.get(match[2]);
    if (target) sheets.push({ name: match[1], path: `xl/${target}` });
  }
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const rows: GasImportRow[] = [];
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
      const values = Object.values(data).filter(Boolean).join(" ").toLowerCase();
      if (values.includes("invoice") || values.includes("supplier")) rows.push({ sourceRowNumber: row.rowNumber, kind: "bill", data });
      else if (values.includes("reading") || values.includes("unidad") || values.includes("unit")) rows.push({ sourceRowNumber: row.rowNumber, kind: "reading", data });
    }
  }
  rmSync(tmpDir, { recursive: true, force: true });
  return rows;
}
