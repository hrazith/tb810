import { generateSpreadsheetTemplate } from "@/server/import/excel/meter-reading-template-generator";

import type { GasReadingTemplateRow } from "./template";

export function generateGasReadingTemplate(rows: GasReadingTemplateRow[]) {
  return generateSpreadsheetTemplate(
    ["Unit", "Previous Reading", "Current Reading", "Reading Date"],
    rows.map((row) => [row.unitNumber, row.previousReading, row.currentReading, row.readingDate]),
  );
}
