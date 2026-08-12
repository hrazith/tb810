"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GasFormState } from "@/server/gas/actions";
import type { GasBillSummary } from "@/server/gas/types";

type Props = {
  bill: GasBillSummary;
  action: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
  readOnly?: boolean;
};

const initialState: GasFormState = {};

function fieldError(field: string, state: GasFormState) {
  return state.fieldErrors?.[field];
}

export function GasBillAmountEditor({ bill, action, readOnly }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);
  const [amount, setAmount] = useState(() => bill.amount.toFixed(2));
  const lastSavedSuccessRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state.success) return;
    if (lastSavedSuccessRef.current === state.success) return;
    lastSavedSuccessRef.current = state.success;
    router.refresh();
  }, [router, state.success]);

  if (readOnly) {
    return <span className="text-sm text-zinc-600">S/{bill.amount.toFixed(2)}</span>;
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="bill_id" value={bill.id} />
      <input type="hidden" name="supplier_name" value={bill.supplier_name} />
      <input type="hidden" name="invoice_number" value={bill.invoice_number} />
      <input type="hidden" name="invoice_date" value={bill.invoice_date} />
      <input type="hidden" name="notes" value={bill.notes ?? ""} />
      <div className="flex items-start gap-2">
        <Input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="h-11 w-32"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending} className="h-11">
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
      {fieldError("amount", state) ? <p className="text-xs text-red-600">{fieldError("amount", state)}</p> : null}
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
