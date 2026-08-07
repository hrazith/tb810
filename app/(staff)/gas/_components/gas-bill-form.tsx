"use client";

import { useActionState } from "react";

import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { GasBillSummary } from "@/server/gas/types";
import type { GasFormState } from "@/server/gas/actions";

type Props = {
  action: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
  bill?: GasBillSummary | null;
  submitLabel: string;
  deleteAction?: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
};

const initialState: GasFormState = {};

function fieldError(field: string, state: GasFormState) {
  return state.fieldErrors?.[field];
}

export function GasBillForm({ action, bill, submitLabel, deleteAction }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? {
    bill_id: bill?.id ?? "",
    building_id: bill?.building_id ?? "",
    supplier_name: bill?.supplier_name ?? "",
    invoice_number: bill?.invoice_number ?? "",
    invoice_date: bill?.invoice_date ?? "",
    amount: String(bill?.amount ?? ""),
    notes: bill?.notes ?? "",
  };
  const locked = Boolean(bill?.processed_at);

  return (
      <Panel as="form" action={formAction as never} className="space-y-6">
      <input type="hidden" name="bill_id" value={values.bill_id ?? ""} />
      <input type="hidden" name="building_id" value={values.building_id ?? ""} />
      {locked ? <input type="hidden" name="processed_at" value={bill?.processed_at ?? ""} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="block text-lg font-medium text-zinc-900">Supplier</span>
          <Input name="supplier_name" defaultValue={values.supplier_name ?? ""} readOnly={locked} />
        </label>
        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Invoice number</span>
          <Input name="invoice_number" defaultValue={values.invoice_number ?? ""} readOnly={locked} />
        </label>
        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Invoice date</span>
          <Input name="invoice_date" type="date" defaultValue={values.invoice_date ?? ""} readOnly={locked} />
        </label>
        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Amount</span>
          <Input name="amount" type="number" step="0.01" min="0" defaultValue={values.amount ?? ""} readOnly={locked} />
        </label>
      </div>
      <label className="block space-y-2">
        <span className="block text-lg font-medium text-zinc-900">Notes</span>
        <textarea name="notes" rows={5} defaultValue={values.notes ?? ""} readOnly={locked} className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm" />
      </label>
      {state.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}
      <div className="flex flex-wrap gap-3">
        {!locked ? (
          <button type="submit" disabled={pending} className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white">
            {pending ? "Saving..." : submitLabel}
          </button>
        ) : (
          <p className="text-sm text-zinc-600">Processed bills are read-only.</p>
        )}
        {!locked && deleteAction ? (
          <form action={deleteAction as never}>
            <input type="hidden" name="bill_id" value={values.bill_id ?? ""} />
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-xl border border-red-200 bg-white px-5 text-sm font-medium text-red-700">
              Delete Bill
            </button>
          </form>
        ) : null}
      </div>
      {fieldError("supplier_name", state) ? <p className="text-sm text-red-600">{fieldError("supplier_name", state)}</p> : null}
    </Panel>
  );
}
