"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type {
  OwnershipTransferDefaults,
  OwnershipTransferFormInput,
  OwnershipTransferInput,
} from "@/server/ownerships/types";

import { OwnerPicker } from "./owner-picker";

type TransferFormValues = OwnershipTransferFormInput;

type TransferFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof OwnershipTransferInput, string>>;
  values?: TransferFormValues;
};

const initialState: TransferFormState = {};

function fieldError(field: string, state: TransferFormState) {
  return state.fieldErrors?.[
    field as keyof NonNullable<TransferFormState["fieldErrors"]>
  ];
}

type Props = {
  defaults: OwnershipTransferDefaults;
  action: (
    prevState: TransferFormState,
    formData: FormData,
  ) => Promise<TransferFormState>;
  submitLabel: string;
  cancelHref: string;
};

function previousMonthEnd(month: string) {
  if (!month) return "Select a billing month";
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 0));
  return date.toISOString().slice(0, 10);
}

export function TransferOwnershipForm({
  defaults,
  action,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? {
    unit_id: defaults.unit.id,
    owner_id: "",
    effective_month: defaults.suggestedEffectiveMonth,
    notes: "",
  };
  const initialOwnerId = String(values.owner_id ?? "");
  const initialEffectiveMonth = String(values.effective_month ?? "");
  const [ownerId, setOwnerId] = useState(initialOwnerId);
  const [effectiveMonth, setEffectiveMonth] = useState<string>(
    initialEffectiveMonth,
  );
  const effectiveMonthError = fieldError("effective_month", state);
  const ownerError = fieldError("owner_id", state);
  const notesError = fieldError("notes", state);

  useEffect(() => {
    setOwnerId(String(values.owner_id ?? ""));
    setEffectiveMonth(String(values.effective_month ?? ""));
  }, [values.owner_id, values.effective_month]);

  const isAssign = !defaults.currentOwnership;
  const currentOwnerThrough = useMemo(
    () => previousMonthEnd(effectiveMonth),
    [effectiveMonth],
  );

  return (
    <Panel as="form" action={formAction} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              {isAssign ? "Assign owner" : "Transfer owner"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              {defaults.unit.unit_number}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              {defaults.unit.unit_type_name} · Account{" "}
              {defaults.unitAccount?.account_number ?? "Unavailable"}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Current owner
              </p>
              <p className="mt-2 text-sm text-zinc-900">
                {defaults.currentOwnership
                  ? defaults.currentOwnership.owner.full_name
                  : "No current owner"}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Current balance
              </p>
              <p className="mt-2 text-sm text-zinc-900">
                {defaults.unitAccount
                  ? defaults.unitAccount.current_balance.toFixed(2)
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Unit account
              </p>
              <p className="mt-2 text-sm text-zinc-900">
                {defaults.unitAccount?.account_number ?? "Unavailable"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <p className="font-medium text-zinc-900">
              Billing changes at the monthly cycle boundary.
            </p>
            <p className="mt-1">
              Select the billing-effective month. No prorating. Historical
              invoices stay with the owner recorded when they were issued.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="block text-sm font-medium text-zinc-900">
              Billing-effective month
            </span>
            <input
              type="month"
              name="effective_month"
              value={effectiveMonth}
              min={defaults.minimumEffectiveMonth}
              onChange={(event) => setEffectiveMonth(event.target.value)}
              aria-invalid={effectiveMonthError ? "true" : undefined}
              aria-describedby={effectiveMonthError ? "effective-month-error" : undefined}
              className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950 aria-[invalid=true]:border-red-500"
            />
            {effectiveMonthError ? (
              <p id="effective-month-error" className="text-sm text-red-600">
                {effectiveMonthError}
              </p>
            ) : null}
          </label>

          <div className="rounded-2xl border border-zinc-200 p-4">
            <p className="text-sm font-medium text-zinc-900">Incoming owner</p>
            <p className="mt-1 text-sm text-zinc-600">
              Search and select the owner who becomes responsible starting with
              the selected billing month.
            </p>
            <div className="mt-3">
              <Link
                href="/owners/new"
                className="text-sm font-medium text-zinc-950 underline-offset-4 transition hover:underline"
              >
                Create Owner
              </Link>
            </div>
            <div className="mt-4">
              <OwnerPicker
                owners={defaults.owners}
                value={ownerId}
                onChange={setOwnerId}
                invalid={Boolean(ownerError)}
                describedBy={ownerError ? "owner-error" : undefined}
              />
            </div>
            {ownerError ? (
              <p id="owner-error" className="mt-3 text-sm text-red-600">
                {ownerError}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <label className="block space-y-2">
        <span className="block text-sm font-medium text-zinc-900">Notes</span>
        <textarea
          name="notes"
          rows={4}
          defaultValue={(state.values?.notes ?? "") as string}
          aria-invalid={notesError ? "true" : undefined}
          aria-describedby={notesError ? "notes-error" : undefined}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none transition focus:border-zinc-950 aria-[invalid=true]:border-red-500"
        />
        {notesError ? (
          <p id="notes-error" className="text-sm text-red-600">
            {notesError}
          </p>
        ) : null}
      </label>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Transfer summary
        </h2>
        <div className="mt-3 space-y-2 text-sm text-zinc-700">
          <p>
            Current owner responsible through:{" "}
            {defaults.currentOwnership ? currentOwnerThrough : "No current owner"}
          </p>
          <p>
            Incoming owner responsible from:{" "}
            {effectiveMonth ? `${effectiveMonth}-01` : "Select a billing month"}
          </p>
          <p>Unit Account remains unchanged.</p>
          <p>
            The incoming Owner becomes responsible for all outstanding debt on
            this Unit Account, including unpaid charges from earlier months.
          </p>
          <p>Existing invoices remain unchanged.</p>
          <p>Future invoices use the incoming Owner starting with the selected billing month.</p>
        </div>
      </div>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending} variant="primary">
          {submitLabel}
        </Button>
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
