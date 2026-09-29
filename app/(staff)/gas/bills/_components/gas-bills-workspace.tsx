"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { createGasBillAction, deleteGasBillAction, updateGasBillAction, type GasFormState } from "@/server/gas/actions";
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

function BillTable({ bills, onSelect }: { bills: GasBillSummary[]; onSelect?: (bill: GasBillSummary) => void }) {
  return (
    <table className="min-w-full divide-y divide-zinc-200 ">
      <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <tr><th className="px-4 py-3">Invoice / receipt</th><th className="px-4 py-3">Invoice date</th><th className="px-4 py-3 text-right">Amount</th></tr>
      </thead>
      <tbody className="divide-y divide-zinc-200 bg-white">
        {bills.map((bill) => (
          <tr key={bill.id} className="hover:bg-zinc-50">
            <td className="px-4 py-4">{onSelect ? <button type="button" className="font-medium text-zinc-950 underline-offset-4 hover:underline" onClick={() => onSelect(bill)}>{bill.invoice_number}</button> : <span className="font-medium text-zinc-950">{bill.invoice_number}</span>}</td>
            <td className="px-4 py-4 text-sm text-zinc-600">{formatDate(bill.invoice_date)}</td>
            <td className="px-4 py-4 text-right text-sm font-medium text-zinc-900">{formatMoney(bill.amount)}</td>
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
  const values = state.values ?? { invoice_number: bill?.invoice_number ?? "", invoice_date: bill?.invoice_date ?? "", amount: bill ? String(bill.amount) : "", notes: bill?.notes ?? "" };

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
        <input type="hidden" name="supplier_name" value={bill?.supplier_name ?? "Not recorded"} />
        <div className="space-y-2"><label htmlFor="gas-invoice-number" className="text-sm font-medium">Invoice / receipt #</label><Input id="gas-invoice-number" name="invoice_number" defaultValue={values.invoice_number} required /></div>
        <div className="space-y-2"><label htmlFor="gas-invoice-date" className="text-sm font-medium">Invoice date</label><Input id="gas-invoice-date" name="invoice_date" type="date" defaultValue={values.invoice_date} required /></div>
        <div className="space-y-2"><label htmlFor="gas-amount" className="text-sm font-medium">Amount</label><div className="relative"><span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base text-zinc-500">S/</span><Input id="gas-amount" name="amount" type="number" step="0.01" min="0" defaultValue={values.amount} className="pl-10" required /></div></div>
        <div className="space-y-2"><label htmlFor="gas-notes" className="text-sm font-medium">Notes <span className="text-zinc-400">(optional)</span></label><textarea id="gas-notes" name="notes" rows={2} defaultValue={values.notes} className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm" /></div>
        {state.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {bill ? <Button type="button" variant="ghost" className="mr-auto text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setConfirmDelete(true)}>Delete bill</Button> : null}
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="whitespace-nowrap" disabled={pending}>{pending ? "Saving..." : bill ? "Save changes" : "Add bill"}</Button>
        </div>
      </form>
      <Dialog open={confirmDelete} title="Delete bill?" description={`Remove invoice / receipt ${bill?.invoice_number ?? ""}?`} className="m-auto w-full max-w-sm rounded-2xl" contentClassName="!p-6 sm:!p-8" onOpenChange={setConfirmDelete}>
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button type="button" variant="destructive" className="whitespace-nowrap" onClick={handleDelete}>Delete bill</Button></div>
      </Dialog>
    </>
  );
}

export function GasBillsWorkspace({ data }: Props) {
  const [tab, setTab] = useState<"pending" | "processed">("pending");
  const [selectedBill, setSelectedBill] = useState<GasBillSummary | null | undefined>(undefined);
  const pendingTotal = data.pendingBills.reduce((total, bill) => total + bill.amount, 0);
  const openAdd = () => setSelectedBill(null);
  const closeEditor = () => setSelectedBill(undefined);
  return (
    <section className="space-y-6 ">
      <div className="px-6 flex flex-wrap items-center justify-between gap-4  py-12">

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Gas Supplier Bills</h1>

        </div><div className="inline-flex gap-1 rounded-full bg-zinc-200 p-1"><button type="button" className={`w-28 rounded-full py-3 text-center text-sm font-medium transition ${tab === "pending" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600"}`} onClick={() => setTab("pending")}>Pending</button><button type="button" className={`w-28 rounded-full py-3 text-center text-sm font-medium transition ${tab === "processed" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600"}`} onClick={() => setTab("processed")}>Processed</button></div></div>
      {tab === "pending" ? <><div className="text-sm text-zinc-600"><span className="font-medium text-zinc-950">{formatBillCount(data.pendingBills.length)}</span> · {formatMoney(pendingTotal)}</div><Panel className="overflow-hidden p-0">{data.pendingBills.length ? <BillTable bills={data.pendingBills} onSelect={setSelectedBill} /> : <div className="px-6 py-12 text-center text-sm text-zinc-500">There are no supplier bills waiting to be processed.</div>}</Panel></> : <div className="space-y-6"><ProcessedContent data={data} /></div>}
      {tab === "pending" ? <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6"><Button type="button" shape="pill" className="shadow-lg" onClick={openAdd}>+ Add bill</Button></div> : null}
      <Dialog open={selectedBill !== undefined} title={selectedBill ? "Edit bill" : "Add bill"} className="m-auto w-full max-w-md rounded-2xl" contentClassName="!p-8 sm:!p-10" onOpenChange={(open) => { if (!open) closeEditor(); }}><BillEditor key={selectedBill?.id ?? "new"} bill={selectedBill ?? null} onClose={closeEditor} onSaved={closeEditor} /></Dialog>
    </section>
  );
}

function ProcessedContent({ data }: Props) {
  return <>
    {data.processedBundles.map((bundle) => <details key={bundle.billingPeriodId} className="group rounded-2xl border border-zinc-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4"><span><strong className="block text-zinc-950">{bundle.monthLabel}</strong><span className="text-sm text-zinc-500">{formatBillCount(bundle.bills.length)} · {formatMoney(bundle.bills.reduce((sum, bill) => sum + bill.amount, 0))}</span><span className="block text-sm text-zinc-500">Processed {formatDate(bundle.processedAt)}</span></span><span aria-hidden="true" className="text-xl leading-none text-zinc-400 transition-transform group-open:rotate-90">›</span></summary><div className="overflow-x-auto border-t border-zinc-200"><BillTable bills={bundle.bills} /></div></details>)}
    <details className="group rounded-2xl border border-zinc-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4"><span><strong className="block text-zinc-950">Legacy processed bills</strong><span className="text-sm text-zinc-500">{formatBillCount(data.legacyProcessedBills.length)}</span><span className="block text-sm text-zinc-500">Processed before TB810 obligation tracking</span></span><span aria-hidden="true" className="text-xl leading-none text-zinc-400 transition-transform group-open:rotate-90">›</span></summary><div className="overflow-x-auto border-t border-zinc-200">{data.legacyProcessedBills.length ? <BillTable bills={data.legacyProcessedBills} /> : <p className="px-5 py-4 text-sm text-zinc-500">No legacy processed bills.</p>}</div></details>
  </>;
}
