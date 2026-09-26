import { NextResponse } from "next/server";

import { generateMeterReadingTemplate } from "@/server/import/excel/meter-reading-template-generator";
import { getWaterReadingUnits } from "@/server/water/unit-meter-readings";

export async function GET() {
  const result = await getWaterReadingUnits();
  if (result.error) return new NextResponse(result.error, { status: 500 });

  const workbook = generateMeterReadingTemplate(result.data.map((unit) => unit.unit_number));
  return new NextResponse(workbook, {
    headers: {
      "Content-Disposition": 'attachment; filename="lecturas.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Cache-Control": "no-store",
    },
  });
}
