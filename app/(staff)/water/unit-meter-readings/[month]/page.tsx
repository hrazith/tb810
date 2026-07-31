import { redirect } from "next/navigation";

import { getActiveReadingMonth } from "@/server/water/unit-meter-readings";
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
  const activeMonth = getActiveReadingMonth();
  const selectedMonth = parseWaterMonthKey(month);

  if (!selectedMonth) {
    redirect(`/water/unit-meter-readings/${activeMonth.key}`);
  }

  return <UnitMeterReadingsMonthPage month={selectedMonth} query={paramsResult.q} deleted={paramsResult.deleted} />;
}

