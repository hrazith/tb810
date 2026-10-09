"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { createGasBillAction, deleteGasBillAction, setGasBillSelectionAction, updateGasBillAction, type GasFormState } from "@/server/gas/actions";
import type { GasBillSummary, GasBillsWorkspaceData } from "@/server/gas/types";

type Props = { data: GasBillsWorkspaceData };
const initialState: GasFormState = {};

function formatMoney(value: number) {
  return `S/${value.toFixed(2)}`;
}

function formatBillCount(count: number) {
  return `${count} ${count === 1 ? "bill" : "bills"}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function billReference(bill: GasBillSummary) {
  return bill.invoice_number ?? "No reference";
}

function monthKeyLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthKey}-01T00:00:00Z`));
}

function PoolControl({ bill, poolMonthKey, poolMonthLabel }: { bill: GasBillSummary; poolMonthKey: string; poolMonthLabel: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedMonth = bill.selected_obligation_month?.slice(0, 7) ?? null;
  if (bill.reserved_billing_period_id) {
    return <span className="text-sm text-zinc-500">Reserved{selectedMonth ? ` · ${monthKeyLabel(selectedMonth)}` : ""}</span>;
  }

  async function submit(obligationMonth: string) {
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("bill_id", bill.id);
    formData.set("obligation_month", obligationMonth);
    const result = await setGasBillSelectionAction(formData);
    setPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  // Purchases are included in the open pool by default; Exclude removes one
  // from the pool and Restore puts it back.
  return (
    <span className="inline-flex flex-col items-end gap-1">
      {selectedMonth ? (
        <span className="inline-flex items-center gap-2 text-sm text-zinc-600">
          {selectedMonth === poolMonthKey ? "Included" : `Included · ${monthKeyLabel(selectedMonth)}`}
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => submit("")}>Exclude</Button>
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 text-sm text-zinc-500">
          Excluded
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => submit(poolMonthKey)}>Restore to {poolMonthLabel}</Button>
        </span>
      )}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

function BillTable({ bills, onSelect, pool }: { bills: GasBillSummary[]; onSelect?: (bill: GasBillSummary) => void; pool?: { monthKey: string; monthLabel: string } }) {
  return (
    <table className="min-w-full divide-y divide-zinc-200 ">
      <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <tr><th className="px-4 py-3">Invoice / receipt</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Purchase date</th><th className="px-4 py-3 text-right">Amount</th>{pool ? <th className="px-4 py-3 text-right">Pool</th> : null}</tr>
      </thead>
      <tbody className="divide-y divide-zinc-200 bg-white">
        {bills.map((bill) => (
          <tr key={bill.id} className="hover:bg-zinc-50">
            <td className="px-4 py-4">{onSelect ? <button type="button" className="font-medium text-zinc-950 underline-offset-4 hover:underline" onClick={() => onSelect(bill)}>{billReference(bill)}</button> : <span className="font-medium text-zinc-950">{billReference(bill)}</span>}</td>
            <td className="px-4 py-4 text-sm text-zinc-600">{bill.supplier_name ?? "—"}</td>
            <td className="px-4 py-4 text-sm text-zinc-600">{formatDate(bill.invoice_date)}</td>
            <td className="px-4 py-4 text-right text-sm font-medium text-zinc-900">{formatMoney(bill.amount)}</td>
            {pool ? <td className="px-4 py-4 text-right"><PoolControl bill={bill} poolMonthKey={pool.monthKey} poolMonthLabel={pool.monthLabel} /></td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BillEditor({ bill, onClose, onSaved }: { bill: GasBillSummary | null; onClose: () => void; onSaved: () => void }) {
  const action = bill ? updateGasBillAction : createGasBillAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const successRef = useRef<string | null>(null);
  const values = state.values ?? { supplier_name: bill?.supplier_name ?? "", invoice_number: bill?.invoice_number ?? "", invoice_date: bill?.invoice_date ?? "", amount: bill ? String(bill.amount) : "", notes: bill?.notes ?? "" };
  const reserved = Boolean(bill?.reserved_billing_period_id);

  useEffect(() => {
    if (!state.success || successRef.current === state.success) return;
    successRef.current = state.success;
    onSaved();
    router.refresh();
  }, [onSaved, router, state.success]);

  async function handleDelete() {
    if (!bill) return;
    const formData = new FormData();
    formData.set("bill_id", bill.id);
    await deleteGasBillAction(formData);
    setConfirmDelete(false);
    onSaved();
    router.refresh();
  }

  return (
    <>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="bill_id" value={bill?.id ?? ""} />
        <div className="space-y-2"><label htmlFor="gas-supplier" className="text-sm font-medium">Supplier <span className="text-zinc-400">(optional)</span></label><Input id="gas-supplier" name="supplier_name" defaultValue={values.supplier_name} readOnly={reserved} /></div>
        <div className="space-y-2"><label htmlFor="gas-invoice-number" className="text-sm font-medium">Invoice / receipt # <span className="text-zinc-400">(optional)</span></label><Input id="gas-invoice-number" name="invoice_number" defaultValue={values.invoice_number} readOnly={reserved} /></div>
        <div className="space-y-2"><label htmlFor="gas-invoice-date" className="text-sm font-medium">Purchase date</label><Input id="gas-invoice-date" name="invoice_date" type="date" defaultValue={values.invoice_date} readOnly={reserved} required /></div>
        <div className="space-y-2"><label htmlFor="gas-amount" className="text-sm font-medium">Amount</label><div className="relative"><span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base text-zinc-500">S/</span><Input id="gas-amount" name="amount" type="number" step="0.01" min="0" defaultValue={values.amount} className="pl-10" readOnly={reserved} required /></div></div>
        <div className="space-y-2"><label htmlFor="gas-notes" className="text-sm font-medium">Notes <span className="text-zinc-400">(optional)</span></label><textarea id="gas-notes" name="notes" rows={2} defaultValue={values.notes} readOnly={reserved} className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm" /></div>
        {reserved ? <p className="text-sm text-zinc-600">This purchase is reserved to a Monthly Obligations package and is read-only.</p> : null}
        {state.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {bill && !reserved ? <Button type="button" variant="ghost" className="mr-auto text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setConfirmDelete(true)}>Delete bill</Button> : null}
          <Button type="button" variant="secondary" onClick={onClose}>{reserved ? "Close" : "Cancel"}</Button>
          {!reserved ? <Button type="submit" className="whitespace-nowrap" disabled={pending}>{pending ? "Saving..." : bill ? "Save changes" : "Add bill"}</Button> : null}
        </div>
      </form>
      <Dialog open={confirmDelete} title="Delete bill?" description={`Remove invoice / receipt ${bill ? billReference(bill) : ""}?`} className="m-auto w-full max-w-sm rounded-2xl" contentClassName="!p-6 sm:!p-8" onOpenChange={setConfirmDelete}>
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button type="button" variant="destructive" className="whitespace-nowrap" onClick={handleDelete}>Delete bill</Button></div>
      </Dialog>
    </>
  );
}

export function GasBillsWorkspace({ data }: Props) {
  const [tab, setTab] = useState<"pending" | "processed">("pending");
  const [selectedBill, setSelectedBill] = useState<GasBillSummary | null | undefined>(undefined);
  const poolBills = data.pendingBills.filter((bill) => !bill.reserved_billing_period_id && bill.selected_obligation_month?.slice(0, 7) === data.poolMonthKey);
  const poolTotal = poolBills.reduce((total, bill) => total + bill.amount, 0);
  const excludedCount = data.pendingBills.filter((bill) => !bill.reserved_billing_period_id && !bill.selected_obligation_month).length;
  const pool = { monthKey: data.poolMonthKey, monthLabel: data.poolMonthLabel };
  const openAdd = () => setSelectedBill(null);
  const closeEditor = () => setSelectedBill(undefined);
  return (
    <section className="space-y-6 ">
      <div className="px-6 flex flex-wrap items-center justify-between gap-4  py-12">

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Gas Supplier Bills</h1>

        </div><div className="inline-flex gap-1 rounded-full bg-zinc-200 p-1"><button type="button" className={`w-28 rounded-full py-3 text-center text-sm font-medium transition ${tab === "pending" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600"}`} onClick={() => setTab("pending")}>Pending</button><button type="button" className={`w-28 rounded-full py-3 text-center text-sm font-medium transition ${tab === "processed" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600"}`} onClick={() => setTab("processed")}>Processed</button></div></div>
      {tab === "pending" ? <><div className="text-sm text-zinc-600">{data.poolMonthLabel} pool: <span className="font-medium text-zinc-950">{formatBillCount(poolBills.length)}</span> · {formatMoney(poolTotal)}{excludedCount ? ` · ${excludedCount} excluded` : ""}</div><Panel className="overflow-x-auto p-0">{data.pendingBills.length ? <BillTable bills={data.pendingBills} onSelect={setSelectedBill} pool={pool} /> : <div className="px-6 py-12 text-center text-sm text-zinc-500">There are no supplier bills waiting to be processed.</div>}</Panel></> : <div className="space-y-6"><ProcessedContent data={data} /></div>}
      {tab === "pending" ? <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6"><Button type="button" shape="pill" className="shadow-lg" onClick={openAdd}>+ Add bill</Button></div> : null}
      <Dialog open={selectedBill !== undefined} title={selectedBill ? "Edit bill" : "Add bill"} className="m-auto w-full max-w-md rounded-2xl" contentClassName="!p-8 sm:!p-10" onOpenChange={(open) => { if (!open) closeEditor(); }}><BillEditor key={selectedBill?.id ?? "new"} bill={selectedBill ?? null} onClose={closeEditor} onSaved={closeEditor} /></Dialog>
    </section>
  );
}

function ProcessedContent({ data }: Props) {
  return <>
    {data.processedBundles.map((bundle) => <details key={bundle.billingPeriodId} className="group rounded-2xl border border-zinc-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4"><span><strong className="block text-zinc-950">{bundle.monthLabel}</strong><span className="text-sm text-zinc-500">{formatBillCount(bundle.bills.length)} · {formatMoney(bundle.bills.reduce((sum, bill) => sum + bill.amount, 0))}</span><span className="block text-sm text-zinc-500">Approved in TB810 · Processed {formatDate(bundle.processedAt)}</span></span><span aria-hidden="true" className="text-xl leading-none text-zinc-400 transition-transform group-open:rotate-90">›</span></summary><div className="overflow-x-auto border-t border-zinc-200"><BillTable bills={bundle.bills} /></div></details>)}
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">Historical supplier purchases</h2>
      {data.historicalGroups.length ? data.historicalGroups.map((group) => <details key={group.key} className="group rounded-2xl border border-zinc-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4"><span><strong className="block text-zinc-950">{group.label}</strong><span className="text-sm text-zinc-500">{formatBillCount(group.bills.length)} · {formatMoney(group.total)}{group.ledgerTotal !== null ? ` · ledger total ${formatMoney(group.ledgerTotal)}` : ""}</span><span className="block text-sm text-zinc-500">{group.detail}</span></span><span aria-hidden="true" className="text-xl leading-none text-zinc-400 transition-transform group-open:rotate-90">›</span></summary><div className="overflow-x-auto border-t border-zinc-200"><BillTable bills={group.bills} /></div></details>) : <p className="px-1 text-sm text-zinc-500">No historical supplier purchases.</p>}
    </section>
    {data.testRecords.length ? <section className="space-y-3">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">Historical test records</h2>
      <details className="group rounded-2xl border border-dashed border-zinc-300 bg-zinc-50"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4"><span><strong className="block text-zinc-700">{formatBillCount(data.testRecords.length)} · test data</strong><span className="block text-sm text-zinc-500">{data.testRecords.map((record) => record.packageLabel ? `Used in the approved ${record.packageLabel} TB810 test package` : "Test record").filter((text, index, all) => all.indexOf(text) === index).join(" · ")}. Not a supplier purchase; kept read-only for traceability.</span></span><span aria-hidden="true" className="text-xl leading-none text-zinc-400 transition-transform group-open:rotate-90">›</span></summary><div className="overflow-x-auto border-t border-zinc-200"><BillTable bills={data.testRecords.map((record) => record.bill)} /></div></details>
    </section> : null}
  </>;
}
