import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { GasImportDialog } from "@/app/(staff)/gas/_components/gas-import-dialog";
import { importGasWorkbookAction, updateGasBillAction } from "@/server/gas/actions";
import { isEligibleGasBill } from "@/server/gas/month-utils";
import type { GasBillSummary } from "@/server/gas/types";

import { GasBillAmountEditor } from "./gas-bill-amount-editor";

type Props = {
  monthKey: string;
  monthLabel: string;
  previousMonthKey: string | null;
  nextMonthKey: string | null;
  tab: "draft" | "processed";
  bills: GasBillSummary[];
};

function monthKeyToDate(monthKey: string) {
  return `${monthKey}-01`;
}

function formatMoney(value: number) {
  return `S/${value.toFixed(2)}`;
}

function buildTabHref(monthKey: string, tab: "draft" | "processed") {
  return tab === "draft" ? `/gas/bills/month/${monthKey}` : `/gas/bills/month/${monthKey}?tab=processed`;
}

export function GasBillsMonthWorkspace({ monthKey, monthLabel, previousMonthKey, nextMonthKey, tab, bills }: Props) {
  const orderedBills = [...bills].sort((left, right) => {
    const dateCompare = left.invoice_date.localeCompare(right.invoice_date);
    if (dateCompare !== 0) return dateCompare;
    return left.invoice_number.localeCompare(right.invoice_number);
  });
  const draftBills = orderedBills.filter((bill) => isEligibleGasBill(bill.invoice_date, bill.processed_at, monthKey));
  const processedBills = orderedBills.filter((bill) => bill.processed_at != null && bill.invoice_date < monthKeyToDate(monthKey));
  const visibleBills = tab === "processed" ? processedBills : draftBills;
  const draftTotal = draftBills.reduce((sum, bill) => sum + bill.amount, 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Gas Supplier Bills</h1>
          <div className="flex items-center gap-3 text-zinc-500">
            {previousMonthKey ? (
              <Button asChild variant="ghost" shape="pill" size="sm" className="px-2 text-lg">
                <Link href={buildTabHref(previousMonthKey, tab)} aria-label={`Previous month: ${previousMonthKey}`}>
                  ‹
                </Link>
              </Button>
            ) : (
              <span className="px-2 text-lg text-zinc-300">‹</span>
            )}
            <span className="text-2xl font-semibold tracking-tight text-zinc-950">{monthLabel}</span>
            {nextMonthKey ? (
              <Button asChild variant="ghost" shape="pill" size="sm" className="px-2 text-lg">
                <Link href={buildTabHref(nextMonthKey, tab)} aria-label={`Next month: ${nextMonthKey}`}>
                  ›
                </Link>
              </Button>
            ) : (
              <span className="px-2 text-lg text-zinc-300">›</span>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <GasImportDialog action={importGasWorkbookAction} />
          <Button asChild variant="primary" shape="pill">
            <Link href="/gas/bills/new">Add Bill</Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button asChild variant={tab === "draft" ? "primary" : "secondary"} shape="pill" size="sm">
          <Link href={buildTabHref(monthKey, "draft")}>Draft</Link>
        </Button>
        <Button asChild variant={tab === "processed" ? "primary" : "secondary"} shape="pill" size="sm">
          <Link href={buildTabHref(monthKey, "processed")}>Processed</Link>
        </Button>
      </div>

      <Panel className="overflow-hidden p-0">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Invoice Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {visibleBills.map((bill) => (
              <tr key={bill.id} className="align-top hover:bg-zinc-50">
                <td className="px-4 py-4">
                  <Link className="font-medium text-zinc-950 hover:underline" href={`/gas/bills/${bill.id}`}>
                    {bill.invoice_number}
                  </Link>
                </td>
                <td className="px-4 py-4 text-sm text-zinc-600">{bill.invoice_date}</td>
                <td className="px-4 py-4 text-sm text-zinc-600">{tab === "processed" ? "Processed" : "Draft"}</td>
                <td className="px-4 py-4">
                  <GasBillAmountEditor key={`${bill.id}-${bill.amount}`} bill={bill} action={updateGasBillAction} readOnly={tab === "processed" || bill.processed_at != null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleBills.length ? <div className="border-t border-zinc-200 px-4 py-6 text-sm text-zinc-600">No {tab} bills found for {monthLabel}.</div> : null}
      </Panel>

      {tab === "draft" ? (
        <div className="flex items-center justify-end gap-8 rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-600 shadow-sm">
          <div>
            <span className="font-medium text-zinc-950">{draftBills.length}</span> draft bills
          </div>
          <div>
            <span className="font-medium text-zinc-950">{formatMoney(draftTotal)}</span> total
          </div>
        </div>
      ) : null}
    </section>
  );
}
