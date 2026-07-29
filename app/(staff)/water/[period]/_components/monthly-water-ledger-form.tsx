"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { MonthlyWaterLedgerData } from "@/server/water/monthly-ledger";

type FormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

type Props = {
  ledger: MonthlyWaterLedgerData;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

function formatReading(value: string) {
  if (!value) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(3).replace(/\.?0+$/, "") : value;
}

export function MonthlyWaterLedgerForm({ ledger, action }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <Panel as="form" action={formAction} className="space-y-6">
      <input type="hidden" name="period_key" value={ledger.period_key} />

      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-950">Unit Meter Readings</h2>
        <p className="text-sm text-zinc-600">
          Enter the current month reading for each condominium unit.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead>
            <tr>
              <th className="py-3 pr-4 text-left text-sm font-semibold text-zinc-900">
                Unit
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-900">
                Floor
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-900">
                Previous Reading
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-900">
                Current Reading
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {ledger.units.map((unit) => (
              <tr key={unit.unit_id}>
                <td className="py-4 pr-4 text-sm font-medium text-zinc-950">
                  {unit.unit_number}
                </td>
                <td className="px-4 py-4 text-sm text-zinc-600">
                  {unit.floor ?? "—"}
                </td>
                <td className="px-4 py-4 text-sm text-zinc-600">
                  {formatReading(unit.previous_reading) || "—"}
                </td>
                <td className="px-4 py-4">
                  <input
                    name={`reading_${unit.unit_id}`}
                    defaultValue={state.values?.[`reading_${unit.unit_id}`] ?? unit.current_reading}
                    inputMode="decimal"
                    step="0.001"
                    min="0"
                    type="number"
                    className="h-11 w-full max-w-[12rem] rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" shape="pill" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    </Panel>
  );
}
