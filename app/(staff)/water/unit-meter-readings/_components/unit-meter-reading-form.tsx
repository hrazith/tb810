"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/ui/panel";
import type { UnitMeterReadingDefaults, UnitOption } from "@/server/water/unit-meter-readings";

type FormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

type Props = {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  units: UnitOption[];
  initialValues?: Partial<Record<string, string>>;
  readingDefaults?: UnitMeterReadingDefaults | null;
  readOnly?: boolean;
};

const initialState: FormState = {};

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatReading(value: number | null) {
  if (value == null) return "—";
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export function UnitMeterReadingForm({
  action,
  submitLabel,
  units,
  initialValues,
  readingDefaults,
  readOnly = false,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? initialValues ?? {};
  const [unitId, setUnitId] = useState(values.unit_id ?? units[0]?.id ?? "");
  const [readingDate, setReadingDate] = useState(
    values.reading_date ?? new Date().toISOString().slice(0, 10),
  );
  const [currentReading, setCurrentReading] = useState(values.reading_end ?? "");
  const [notes, setNotes] = useState(values.notes ?? "");

  useEffect(() => {
    if (!state.values) return;
    setUnitId(state.values.unit_id ?? unitId);
    setReadingDate(state.values.reading_date ?? readingDate);
    setCurrentReading(state.values.reading_end ?? currentReading);
    setNotes(state.values.notes ?? notes);
  }, [currentReading, notes, readingDate, state.values, unitId]);

  const previousReading = readingDefaults?.previousReading ?? null;
  const previousReadingDate = readingDefaults?.previousReadingDate ?? null;
  const consumption = useMemo(() => {
    const previous = previousReading;
    const current = toNumber(currentReading);
    if (previous === null || current === null) return null;
    return current - previous >= 0 ? current - previous : null;
  }, [currentReading, previousReading]);

  const currentMonthLabel = readingDefaults?.readingMonth ?? "Current month";

  return (
    <Panel as="form" action={formAction} className="space-y-6">
      <input type="hidden" name="reading_id" value={initialValues?.reading_id ?? ""} />
      <input type="hidden" name="status" value={initialValues?.status ?? "recorded"} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-2 md:col-span-2">
          <span className="text-sm font-medium text-zinc-900">Reading Month</span>
          <input
            value={currentMonthLabel}
            readOnly
            className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-700"
          />
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="text-sm font-medium text-zinc-900">Unit</span>
          <input
            list="unit-options"
            name="unit_id"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            placeholder="Search by unit number"
            readOnly={readOnly}
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
          />
          <datalist id="unit-options">
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.unit_number}
                {unit.floor ? ` - Floor ${unit.floor}` : ""}
              </option>
            ))}
          </datalist>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Reading Date</span>
          <input
            name="reading_date"
            type="date"
            value={readingDate}
            onChange={(e) => setReadingDate(e.target.value)}
            readOnly={readOnly}
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Current Reading</span>
          <input
            name="reading_end"
            type="number"
            min="0"
            step="0.001"
            inputMode="decimal"
            value={currentReading}
            onChange={(e) => setCurrentReading(e.target.value)}
            readOnly={readOnly}
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Previous Reading</span>
          <input
            value={formatReading(previousReading)}
            readOnly
            className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-700"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Previous Reading Date</span>
          <input
            value={previousReadingDate ?? "—"}
            readOnly
            className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-700"
          />
        </label>
      </div>

      <Panel className="space-y-2 bg-zinc-50">
        <p className="text-sm font-medium text-zinc-900">Live Consumption Preview</p>
        <p className="text-sm text-zinc-600">
          {consumption == null ? "Cannot calculate until both readings are available." : `${formatReading(consumption)} m3`}
        </p>
      </Panel>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-zinc-900">Notes</span>
        <textarea
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
      </div>
    </Panel>
  );
}
