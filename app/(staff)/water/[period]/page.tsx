import { notFound, redirect } from "next/navigation";

import { parseWaterMonthKey } from "@/server/water/month";

type PageProps = {
  params: Promise<{
    period: string;
  }>;
};

// Compatibility route for the retired Monthly Water Ledger. Only a canonical
// YYYY-MM month is forwarded to Unit Water; anything else is not a month.
export default async function WaterPeriodRedirectPage({ params }: PageProps) {
  const { period } = await params;
  const periodKey = parseWaterMonthKey(period);
  if (!periodKey) {
    notFound();
  }

  redirect(`/water/unit-meter-readings/${periodKey}`);
}
