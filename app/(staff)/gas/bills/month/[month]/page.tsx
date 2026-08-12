import { redirect } from "next/navigation";

import { listGasBills } from "@/server/gas";
import { GasBillsMonthWorkspace } from "../../_components/gas-bills-month-workspace";

type PageProps = {
  params: Promise<{
    month: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isMonthKey(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function monthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function previousMonthKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCMonth(parsed.getUTCMonth() - 1);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCMonth(parsed.getUTCMonth() + 1);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function GasBillsMonthPage({ params, searchParams }: PageProps) {
  const { month } = await params;
  const paramsResult = (await searchParams) ?? {};
  const selectedMonthKey = isMonthKey(month) ? month : currentMonthKey();
  if (!isMonthKey(month)) {
    redirect(`/gas/bills/month/${selectedMonthKey}`);
  }

  const billsResult = await listGasBills();
  if (billsResult.error) throw new Error(billsResult.error);

  const tab = paramsResult.tab === "processed" ? "processed" : "draft";

  return (
    <GasBillsMonthWorkspace
      monthKey={selectedMonthKey}
      monthLabel={monthLabel(selectedMonthKey)}
      previousMonthKey={previousMonthKey(selectedMonthKey)}
      nextMonthKey={nextMonthKey(selectedMonthKey)}
      tab={tab}
      bills={billsResult.data}
    />
  );
}
