import { NextResponse } from "next/server";

import { generateGasReadingTemplate } from "@/server/gas/template-generator";
import { buildGasReadingTemplateRows } from "@/server/gas/template";
import { listGasReadings } from "@/server/gas";
import { listUnits } from "@/server/units";

type RouteContext = {
  params: Promise<{ month: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { month } = await params;
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("Invalid Gas reading month.", { status: 400 });

  const unitsResult = await listUnits();
  if (unitsResult.error) return new NextResponse(unitsResult.error, { status: 500 });
  const readingsResult = await listGasReadings(unitsResult.data);
  if (readingsResult.error) return new NextResponse(readingsResult.error, { status: 500 });

  const rows = buildGasReadingTemplateRows(unitsResult.data, readingsResult.data, month);
  const workbook = generateGasReadingTemplate(rows);
  return new NextResponse(workbook, {
    headers: {
      "Content-Disposition": `attachment; filename="gas-readings-${month}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Cache-Control": "no-store",
    },
  });
}
