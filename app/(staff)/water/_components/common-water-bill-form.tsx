"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import type { WaterBillFormState } from "@/server/water";

type Props = {
  action: (
    prevState: WaterBillFormState,
    formData: FormData,
  ) => Promise<WaterBillFormState>;
  cancelHref: string;
  submitLabel: string;
  previousReadingHelpText: string;
  previousReadingLabel: string;
  previousReadingReadOnly?: boolean;
  utilityBillId?: string;
  initialValues?: Partial<{
    bill_date: string;
    previous_reading: string;
    current_reading: string;
    amount: string;
    description: string;
    notes: string;
  }>;
};

const initialState: WaterBillFormState = {};

function fieldError(field: string, state: WaterBillFormState) {
  return state.fieldErrors?.[
    field as keyof NonNullable<WaterBillFormState["fieldErrors"]>
  ];
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function CommonWaterBillForm({
  action,
  cancelHref,
  submitLabel,
  previousReadingHelpText,
  previousReadingLabel,
  previousReadingReadOnly = true,
  utilityBillId,
  initialValues,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [billDate, setBillDate] = useState(
    state.values?.bill_date ?? initialValues?.bill_date ?? "",
  );
  const [previousReading, setPreviousReading] = useState(
    state.values?.previous_reading ?? initialValues?.previous_reading ?? "",
  );
  const [currentReading, setCurrentReading] = useState(
    state.values?.current_reading ?? initialValues?.current_reading ?? "",
  );
  const [amount, setAmount] = useState(
    state.values?.amount ?? initialValues?.amount ?? "",
  );
  const [description, setDescription] = useState(
    state.values?.description ?? initialValues?.description ?? "",
  );
  const [notes, setNotes] = useState(state.values?.notes ?? initialValues?.notes ?? "");

  useEffect(() => {
    if (!state.values) return;

    if (state.values.bill_date !== undefined) {
      setBillDate(state.values.bill_date);
    }
    if (state.values.previous_reading !== undefined) {
      setPreviousReading(state.values.previous_reading);
    }
    if (state.values.current_reading !== undefined) {
      setCurrentReading(state.values.current_reading);
    }
    if (state.values.amount !== undefined) {
      setAmount(state.values.amount);
    }
    if (state.values.description !== undefined) {
      setDescription(state.values.description);
    }
    if (state.values.notes !== undefined) {
      setNotes(state.values.notes);
    }
  }, [state.values]);

  const totalConsumption = useMemo(() => {
    const prev = toNumber(previousReading);
    const curr = toNumber(currentReading);

    if (prev === null || curr === null) {
      return null;
    }

    const value = curr - prev;
    return value > 0 ? value : null;
  }, [currentReading, previousReading]);

  const unitCost = useMemo(() => {
    const total = totalConsumption;
    const totalAmount = toNumber(amount);

    if (total === null || totalAmount === null || total === 0) {
      return null;
    }

    return totalAmount / total;
  }, [amount, totalConsumption]);

  const summary = [
    { label: "Total Consumption", value: totalConsumption },
    { label: "Unit Cost", value: unitCost },
  ];

  return (
    <Panel as="form" action={formAction} className="space-y-6">
      {utilityBillId ? (
        <input type="hidden" name="utility_bill_id" value={utilityBillId} />
      ) : null}
      <input type="hidden" name="previous_reading" value={previousReading} />
      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2">
          <span className="block text-sm font-medium text-zinc-900">
            Bill date
          </span>
          <input
            name="bill_date"
            type="date"
            value={billDate}
            onChange={(event) => setBillDate(event.target.value)}
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
          />
          {fieldError("bill_date", state) ? (
            <p className="text-sm text-red-600">{fieldError("bill_date", state)}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-zinc-900">
            Invoiced amount
          </span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
          />
          {fieldError("amount", state) ? (
            <p className="text-sm text-red-600">{fieldError("amount", state)}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-zinc-900">
            {previousReadingLabel}
          </span>
          <input
            name="previous_reading"
            type="number"
            step="0.001"
            min="0"
            inputMode="decimal"
            value={previousReading}
            readOnly={previousReadingReadOnly}
            onChange={
              previousReadingReadOnly
                ? undefined
                : (event) => setPreviousReading(event.target.value)
            }
            className="h-12 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-sm outline-none transition read-only:cursor-not-allowed focus:border-zinc-950"
          />
          <p className="text-xs text-zinc-500">{previousReadingHelpText}</p>
          {fieldError("previous_reading", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("previous_reading", state)}
            </p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-zinc-900">
            Current reading
          </span>
          <input
            name="current_reading"
            type="number"
            step="0.001"
            min="0"
            inputMode="decimal"
            value={currentReading}
            onChange={(event) => setCurrentReading(event.target.value)}
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
          />
          {fieldError("current_reading", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("current_reading", state)}
            </p>
          ) : null}
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {summary.map((item) => (
          <div key={item.label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {item.label}
            </p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">
              {item.value === null
                ? "—"
                : item.label === "Unit Cost"
                  ? `PEN ${item.value.toFixed(4)}`
                  : item.value.toFixed(3).replace(/\.?0+$/, "")}
            </p>
          </div>
        ))}
      </div>

      <label className="block space-y-2">
        <span className="block text-sm font-medium text-zinc-900">
          Description
        </span>
        <input
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
          placeholder="Sedapal invoice reference"
        />
        {fieldError("description", state) ? (
          <p className="text-sm text-red-600">
            {fieldError("description", state)}
          </p>
        ) : null}
      </label>

      <label className="block space-y-2">
        <span className="block text-sm font-medium text-zinc-900">Notes</span>
        <textarea
          name="notes"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none transition focus:border-zinc-950"
        />
        {fieldError("notes", state) ? (
          <p className="text-sm text-red-600">{fieldError("notes", state)}</p>
        ) : null}
      </label>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
        >
          Cancel
        </Link>
      </div>
    </Panel>
  );
}
