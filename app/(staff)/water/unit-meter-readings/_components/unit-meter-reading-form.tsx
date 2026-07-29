"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Panel } from "@/components/ui/panel";

type FormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

type UnitOption = { id: string; unit_number: string; floor: string | null };

type Props = {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  units: UnitOption[];
  initialValues?: Partial<Record<string, string>>;
  readingDefaults?: { previousReading: number | null; previousDate: string | null };
};

const initialState: FormState = {};

export function UnitMeterReadingForm({ action, submitLabel, units, initialValues, readingDefaults }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [unitId, setUnitId] = useState(state.values?.unit_id ?? initialValues?.unit_id ?? units[0]?.id ?? "");
  const [readingDate, setReadingDate] = useState(state.values?.reading_date ?? initialValues?.reading_date ?? "");
  const [readingEnd, setReadingEnd] = useState(state.values?.reading_end ?? initialValues?.reading_end ?? "");
  const [readingStart, setReadingStart] = useState(state.values?.reading_start ?? initialValues?.reading_start ?? (readingDefaults?.previousReading == null ? "" : String(readingDefaults.previousReading)));
  const [status, setStatus] = useState(state.values?.status ?? initialValues?.status ?? "recorded");
  const [notes, setNotes] = useState(state.values?.notes ?? initialValues?.notes ?? "");

  useEffect(() => {
    if (!readingDate && readingDefaults?.previousDate) {
      setReadingDate(readingDefaults.previousDate);
    }
  }, [readingDate, readingDefaults?.previousDate]);

  const currentMonth = useMemo(() => {
    if (!readingDate) return "";
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${readingDate}T00:00:00Z`));
  }, [readingDate]);

  return (
    <Panel as="form" action={formAction} className="space-y-6">
      <input type="hidden" name="reading_id" value={initialValues?.reading_id ?? ""} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Unit</span>
          <select name="unit_id" value={unitId} onChange={(e) => setUnitId(e.target.value)} className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm">
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.unit_number}{unit.floor ? ` - Floor ${unit.floor}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Reading Date</span>
          <input name="reading_date" type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm" />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Reading Month</span>
          <input value={currentMonth} readOnly className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm" />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Current Reading</span>
          <input name="reading_end" type="number" step="0.001" min="0" value={readingEnd} onChange={(e) => setReadingEnd(e.target.value)} className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm" />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Previous Reading</span>
          <input name="reading_start" type="number" step="0.001" min="0" value={readingStart} onChange={(e) => setReadingStart(e.target.value)} className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm" />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Status</span>
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value as any)} className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm">
            <option value="recorded">Recorded</option>
            <option value="reviewed">Reviewed</option>
            <option value="approved">Approved</option>
            <option value="void">Void</option>
          </select>
        </label>
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-zinc-900">Notes</span>
        <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
      </label>
      {state.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white">{pending ? "Saving..." : submitLabel}</button>
    </Panel>
  );
}
