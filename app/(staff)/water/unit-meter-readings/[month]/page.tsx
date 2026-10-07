import { redirect } from "next/navigation";

import { getBusinessNow } from "@/server/business-date";
import { canEditSourceMonth } from "@/server/water/unit-meter-readings";
import { parseWaterMonthKey } from "@/server/water/month";

import { UnitMeterReadingsMonthPage } from "../_components/unit-meter-readings-month-page";

type PageProps = {
  params: Promise<{
    month: string;
  }>;
  searchParams?: Promise<{
    q?: string;
    deleted?: string;
  }>;
};

export default async function UnitMeterReadingsMonthRoute({ params, searchParams }: PageProps) {
  const { month } = await params;
  const paramsResult = (await searchParams) ?? {};
  const selectedMonth = parseWaterMonthKey(month);
  const historicalEditingAvailable =
    process.env.NODE_ENV === "development" &&
    process.env.TB810_ALLOW_HISTORICAL_READING_EDITS === "true";

  if (!selectedMonth) {
    redirect("/water/unit-meter-readings");
  }
  // Intake and Start Over are governed by source-month editability, not by the calendar month.
  const editability = await canEditSourceMonth(selectedMonth, await getBusinessNow());
  if (editability.error) throw new Error(editability.error);

  return (
    <UnitMeterReadingsMonthPage
      month={selectedMonth}
      query={paramsResult.q}
      deleted={paramsResult.deleted}
      historicalEditingAvailable={historicalEditingAvailable}
      sourceMonthOpen={editability.allowed}
    />
  );
}
