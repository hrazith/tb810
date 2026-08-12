"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GasFormState } from "@/server/gas/actions";

export type GasMonthOption = {
  key: string;
  label: string;
};

export type GasReadingLedgerRow = {
  unit_id: string;
  unit_number: string;
  floor: string | null;
  current_reading: number | null;
  previous_reading: number | null;
  consumption: number | null;
  reading_date: string;
  reading_id: string | null;
  has_reading: boolean;
};

type Props = {
  action: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
  selectedMonthKey: string;
  monthOptions: GasMonthOption[];
  rows: GasReadingLedgerRow[];
};

const initialState: GasFormState = {};

function fieldError(field: string, state: GasFormState) {
  return state.fieldErrors?.[field];
}

function monthKeyToDate(monthKey: string) {
  return `${monthKey}-01`;
}

function monthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function readingValue(value: number | null | undefined) {
  return value == null ? "—" : value.toFixed(3).replace(/\.?0+$/, "");
}

function GasReadingRow({ action, row, selectedMonthKey }: { action: Props["action"]; row: GasReadingLedgerRow; selectedMonthKey: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);
  const [currentReading, setCurrentReading] = useState(row.current_reading == null ? "" : String(row.current_reading));
  const [readingDate, setReadingDate] = useState(row.reading_date);
  const lastSuccessRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state.success) return;
    if (lastSuccessRef.current === state.success) return;
    lastSuccessRef.current = state.success;
    router.refresh();
  }, [router, state.success]);

  const consumption = useMemo(() => {
    if (row.previous_reading == null || currentReading.trim() === "") return null;
    const parsed = Number(currentReading);
    if (!Number.isFinite(parsed)) return null;
    return parsed - row.previous_reading >= 0 ? parsed - row.previous_reading : null;
  }, [currentReading, row.previous_reading]);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="unit_id" value={row.unit_id} />
      <input type="hidden" name="reading_month" value={monthKeyToDate(selectedMonthKey)} />
      {row.reading_id ? <input type="hidden" name="reading_id" value={row.reading_id} /> : null}
      <input type="hidden" name="notes" value="" />
      <div className="px-4 py-4">
        <div className="font-medium text-zinc-950">{row.unit_number}</div>
        {row.floor ? <div className="text-xs text-zinc-500">Floor {row.floor}</div> : null}
      </div>
      <div className="px-4 py-4">
        <Input
          name="current_reading"
          type="number"
          step="0.001"
          min="0"
          value={currentReading}
          onChange={(event) => setCurrentReading(event.target.value)}
        />
        {fieldError("current_reading", state) ? <p className="mt-2 text-xs text-red-600">{fieldError("current_reading", state)}</p> : null}
      </div>
      <div className="px-4 py-4 text-sm text-zinc-600">{readingValue(row.previous_reading)}</div>
      <div className="px-4 py-4 text-sm text-zinc-600">{consumption == null ? "—" : readingValue(consumption)}</div>
      <div className="px-4 py-4">
        <Input
          name="reading_date"
          type="date"
          value={readingDate}
          onChange={(event) => setReadingDate(event.target.value)}
        />
        {fieldError("reading_date", state) ? <p className="mt-2 text-xs text-red-600">{fieldError("reading_date", state)}</p> : null}
      </div>
      <div className="px-4 py-4">
        {row.has_reading ? (
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Update"}
          </Button>
        ) : (
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        )}
        {state.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
        <div className="mt-2 text-xs text-zinc-500">{row.has_reading ? "Recorded" : "Missing"}</div>
      </div>
    </form>
  );
}

export function GasReadingLedgerPanel({ action, selectedMonthKey, monthOptions, rows }: Props) {
  const router = useRouter();
  const completedCount = rows.filter((row) => row.has_reading).length;
  const missingCount = rows.length - completedCount;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Month ledger</p>
          <label className="space-y-2">
            <span className="block text-lg font-medium text-zinc-900">Reading month</span>
            <select
              value={selectedMonthKey}
              onChange={(event) => {
                const nextMonth = event.target.value;
                router.replace(`/gas/readings/month/${nextMonth}`);
              }}
              className="h-12 rounded-xl border border-zinc-300 bg-white px-4 text-sm"
            >
              {monthOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-1 text-sm text-zinc-600">
          <div>Eligible Units: {rows.length}</div>
          <div>Completed readings: {completedCount}</div>
          <div>Missing readings: {missingCount}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <div>Unit</div>
          <div>Current</div>
          <div>Previous</div>
          <div>Consumption</div>
          <div>Reading Date</div>
          <div />
        </div>
        <div className="divide-y divide-zinc-200 bg-white">
          {rows.map((row) => (
            <div key={row.unit_id} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-start">
              <GasReadingRow action={action} row={row} selectedMonthKey={selectedMonthKey} />
            </div>
          ))}
        </div>
      </div>
      <div className="text-sm text-zinc-500">
        {monthLabel(selectedMonthKey)} operational ledger. Completed rows remain visible after save.
      </div>
    </div>
  );
}
