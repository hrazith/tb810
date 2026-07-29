import { notFound } from "next/navigation";

import { Panel } from "@/components/ui/panel";
import { formatMonthYear } from "@/lib/water-dates";
import { getMonthlyWaterLedger } from "@/server/water/monthly-ledger";

import { saveMonthlyWaterLedgerAction } from "./actions";
import { MonthlyWaterLedgerForm } from "./_components/monthly-water-ledger-form";

type PageProps = {
  params: Promise<{
    period: string;
  }>;
};

function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatReading(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export default async function MonthlyWaterLedgerPage({ params }: PageProps) {
  const { period } = await params;
  const result = await getMonthlyWaterLedger(period);

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.data) {
    notFound();
  }

  const ledger = result.data;
  const monthTitle = formatMonthYear(new Date(`${ledger.period_start}T00:00:00Z`));

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Water
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          {monthTitle}
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel as="section">
          <h2 className="text-lg font-semibold text-zinc-950">Sedapal Invoice</h2>
          <dl className="mt-4 grid gap-3 text-sm text-zinc-600">
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Building</dt>
              <dd>{ledger.building_name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Billing Period</dt>
              <dd>{ledger.utility_bill?.billing_period_id ? monthTitle : "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Invoice Amount</dt>
              <dd>{formatMoney(ledger.utility_bill?.amount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Status</dt>
              <dd>{ledger.utility_bill?.status ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Description</dt>
              <dd>{ledger.utility_bill?.description ?? "—"}</dd>
            </div>
          </dl>
        </Panel>

        <Panel as="section">
          <h2 className="text-lg font-semibold text-zinc-950">Master Meter</h2>
          <dl className="mt-4 grid gap-3 text-sm text-zinc-600">
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Previous Reading</dt>
              <dd>{formatReading(ledger.utility_bill?.previous_reading)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Current Reading</dt>
              <dd>{formatReading(ledger.utility_bill?.current_reading)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Total Consumption</dt>
              <dd>{formatReading(ledger.utility_bill?.total_consumption)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Unit Cost</dt>
              <dd>{formatMoney(ledger.utility_bill?.unit_cost)}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <MonthlyWaterLedgerForm ledger={ledger} action={saveMonthlyWaterLedgerAction} />
    </section>
  );
}
