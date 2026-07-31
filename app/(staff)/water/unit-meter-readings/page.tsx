import { redirect } from "next/navigation";

import { getActiveReadingMonth } from "@/server/water/unit-meter-readings";
import { parseWaterMonthKey } from "@/server/water/month";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    month?: string;
    deleted?: string;
  }>;
};

export default async function UnitMeterReadingsRedirectPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const activeMonth = getActiveReadingMonth();
  const selectedMonth = parseWaterMonthKey(params.month) ?? activeMonth.key;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.deleted) query.set("deleted", params.deleted);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  redirect(`/water/unit-meter-readings/${selectedMonth}${suffix}`);
}

