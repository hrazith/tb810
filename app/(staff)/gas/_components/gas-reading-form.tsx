"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { GasFormState } from "@/server/gas/actions";
import type { GasReadingSummary } from "@/server/gas/types";
import type { UnitListItem } from "@/server/units/types";

type Props = {
  action: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
  units: UnitListItem[];
  readings: GasReadingSummary[];
  submitLabel: string;
  initialMonth?: string;
};

const initialState: GasFormState = {};

function fieldError(field: string, state: GasFormState) {
  return state.fieldErrors?.[field];
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function GasReadingForm({ action, units, readings, submitLabel, initialMonth }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const router = useRouter();
  const lastSuccessRef = useRef<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [readingMonth, setReadingMonth] = useState(initialMonth ?? currentMonthKey());
  const [readingDate, setReadingDate] = useState(todayKey());
  const [currentReading, setCurrentReading] = useState("");
  const [notes, setNotes] = useState("");

  const eligibleUnits = useMemo(() => {
    const excludedUnitIds = new Set(
      readings.filter((reading) => reading.reading_month.slice(0, 7) === readingMonth).map((reading) => reading.unit_id),
    );
    return units.filter(
      (unit) => unit.unit_type_code === "condo" && unit.has_gas_service && !excludedUnitIds.has(unit.id),
    );
  }, [readingMonth, readings, units]);

  useEffect(() => {
    if (!state.success) return;
    if (lastSuccessRef.current === state.success) return;
    lastSuccessRef.current = state.success;
    router.refresh();
  }, [router, state.success]);

  const visibleSelectedUnitId = eligibleUnits.some((unit) => unit.id === selectedUnitId) ? selectedUnitId : "";
  const selectedUnit = eligibleUnits.find((unit) => unit.id === visibleSelectedUnitId) ?? null;
  const previousReading = useMemo(() => {
    if (!selectedUnit) return null;
    return (
      readings
        .filter((reading) => reading.unit_id === selectedUnit.id && reading.reading_month.slice(0, 7) < readingMonth)
        .sort((a, b) => b.reading_month.localeCompare(a.reading_month))[0]?.current_reading ?? null
    );
  }, [readingMonth, readings, selectedUnit]);

  const consumption = useMemo(() => {
    if (previousReading == null || currentReading.trim() === "") return null;
    const parsed = Number(currentReading);
    if (!Number.isFinite(parsed)) return null;
    return parsed - previousReading >= 0 ? parsed - previousReading : null;
  }, [currentReading, previousReading]);

  function resetOnMonthChange(nextMonth: string) {
    setReadingMonth(nextMonth);
    if (!nextMonth) return;
    const nextEligibleUnits = units.filter((unit) => {
      if (unit.unit_type_code !== "condo" || !unit.has_gas_service) return false;
      return !readings.some((reading) => reading.unit_id === unit.id && reading.reading_month.slice(0, 7) === nextMonth);
    });
    if (selectedUnitId && !nextEligibleUnits.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId("");
    }
  }

  return (
    <Panel as="form" action={formAction} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="block text-lg font-medium text-zinc-900">Unit</span>
          <select
            name="unit_id"
            value={visibleSelectedUnitId}
            onChange={(event) => setSelectedUnitId(event.target.value)}
            className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm"
          >
            <option value="">Select Unit</option>
            {eligibleUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.unit_number}
              </option>
            ))}
          </select>
          {fieldError("unit_id", state) ? <p className="text-sm text-red-600">{fieldError("unit_id", state)}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Reading month</span>
          <Input name="reading_month" type="month" value={readingMonth} onChange={(event) => resetOnMonthChange(event.target.value)} />
          {fieldError("reading_month", state) ? <p className="text-sm text-red-600">{fieldError("reading_month", state)}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Reading date</span>
          <Input name="reading_date" type="date" value={readingDate} onChange={(event) => setReadingDate(event.target.value)} />
          {fieldError("reading_date", state) ? <p className="text-sm text-red-600">{fieldError("reading_date", state)}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Previous reading</span>
          <Input value={previousReading == null ? "—" : previousReading.toFixed(3)} readOnly className="bg-zinc-50" />
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Current reading</span>
          <Input
            name="current_reading"
            type="number"
            step="0.001"
            min="0"
            value={currentReading}
            onChange={(event) => setCurrentReading(event.target.value)}
          />
          {fieldError("current_reading", state) ? <p className="text-sm text-red-600">{fieldError("current_reading", state)}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Consumption</span>
          <Input value={consumption == null ? "—" : consumption.toFixed(3)} readOnly className="bg-zinc-50" />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="block text-lg font-medium text-zinc-900">Notes</span>
        <textarea
          name="notes"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
        />
        {fieldError("notes", state) ? <p className="text-sm text-red-600">{fieldError("notes", state)}</p> : null}
      </label>

      {state.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}

      <div className="flex gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link href="/gas/readings">Cancel</Link>
        </Button>
        <button type="submit" disabled={pending} className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white">
          {pending ? "Saving..." : submitLabel}
        </button>
      </div>
    </Panel>
  );
}
