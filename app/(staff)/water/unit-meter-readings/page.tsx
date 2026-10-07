import { redirect } from "next/navigation";

import { getPrimaryUnitWaterSourceMonth } from "@/server/water/unit-meter-readings";
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
  // Default to the source month consumed by Giuliana's active K6 package.
  const primaryMonth = await getPrimaryUnitWaterSourceMonth();
  if (primaryMonth.error) throw new Error(primaryMonth.error);
  if (!primaryMonth.data) throw new Error("Current building not found.");
  const selectedMonth = parseWaterMonthKey(params.month) ?? primaryMonth.data.key;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.deleted) query.set("deleted", params.deleted);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  redirect(`/water/unit-meter-readings/${selectedMonth}${suffix}`);
}
