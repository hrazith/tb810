"use client";

import { useActionState } from "react";

import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { GasFormState } from "@/server/gas/actions";
import type { GasReadingSummary } from "@/server/gas/types";
import type { UnitListItem } from "@/server/units/types";

type Props = {
  action: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
  units: UnitListItem[];
  reading?: GasReadingSummary | null;
  submitLabel: string;
};

const initialState: GasFormState = {};

function fieldError(field: string, state: GasFormState) {
  return state.fieldErrors?.[field];
}

export function GasReadingForm({ action, units, reading, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? {
    reading_id: reading?.id ?? "",
    building_id: reading?.building_id ?? "",
    unit_id: reading?.unit_id ?? "",
    reading_month: reading?.reading_month ?? "",
    reading_date: reading?.reading_date ?? "",
    previous_reading: reading?.previous_reading != null ? String(reading.previous_reading) : "",
    current_reading: String(reading?.current_reading ?? ""),
    notes: reading?.notes ?? "",
  };

  const eligibleUnits = units.filter((unit) => unit.unit_type_code === "condo" && unit.has_gas_service);

  return (
    <Panel as="form" action={formAction as never} className="space-y-6">
      <input type="hidden" name="reading_id" value={values.reading_id ?? ""} />
      <input type="hidden" name="building_id" value={values.building_id ?? ""} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="block text-lg font-medium text-zinc-900">Unit</span>
          <select
            name="unit_id"
            defaultValue={values.unit_id ?? ""}
            className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm"
          >
            <option value="">Select Unit</option>
            {eligibleUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.unit_number}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Reading month</span>
          <Input name="reading_month" type="month" defaultValue={values.reading_month ?? ""} />
        </label>
        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Reading date</span>
          <Input name="reading_date" type="date" defaultValue={values.reading_date ?? ""} />
        </label>
        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Previous reading</span>
          <Input name="previous_reading" type="number" step="0.001" min="0" defaultValue={values.previous_reading ?? ""} />
        </label>
        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Current reading</span>
          <Input name="current_reading" type="number" step="0.001" min="0" defaultValue={values.current_reading ?? ""} />
        </label>
      </div>
      <label className="block space-y-2">
        <span className="block text-lg font-medium text-zinc-900">Notes</span>
        <textarea name="notes" rows={4} defaultValue={values.notes ?? ""} className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm" />
      </label>
      {state.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white">
        {pending ? "Saving..." : submitLabel}
      </button>
      {fieldError("unit_id", state) ? <p className="text-sm text-red-600">{fieldError("unit_id", state)}</p> : null}
    </Panel>
  );
}
