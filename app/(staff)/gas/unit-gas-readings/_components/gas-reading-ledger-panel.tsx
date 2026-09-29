"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DownloadSimple } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { formatPeruvianDate } from "@/lib/water-dates";
import type { GasFormState } from "@/server/gas/actions";
import { clearCurrentGasMonthAction } from "@/server/gas/actions";
import {
  gasReadingMutationKind,
  reconcileGasReadingDraft,
  shouldSubmitGasReading,
} from "@/server/gas/editability";

import { MonthLedgerSelector } from "@/app/(staff)/water/unit-meter-readings/_components/month-ledger-selector";

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
  reading_date: string | null;
  reading_id: string | null;
  has_reading: boolean;
};

type Props = {
  createAction: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
  updateAction: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
  selectedMonthKey: string;
  monthOptions: GasMonthOption[];
  rows: GasReadingLedgerRow[];
  isCurrentMonth: boolean;
  monthEditable: boolean;
};

const initialState: GasFormState = {};

function fieldError(field: string, state: GasFormState) {
  return state.fieldErrors?.[field];
}

function monthKeyToDate(monthKey: string) {
  return `${monthKey}-01`;
}

function readingValue(value: number | null | undefined) {
  return value == null ? "—" : value.toFixed(3).replace(/\.?0+$/, "");
}

const GAS_LEDGER_GRID_CLASS =
  "grid grid-cols-1 gap-3 md:grid-cols-[minmax(140px,1.1fr)_minmax(140px,1fr)_minmax(110px,0.75fr)_minmax(120px,0.85fr)_minmax(160px,1fr)] md:items-center";

function GasReadingRow({ createAction, updateAction, row, selectedMonthKey, monthEditable }: { createAction: Props["createAction"]; updateAction: Props["updateAction"]; row: GasReadingLedgerRow; selectedMonthKey: string; monthEditable: boolean }) {
  const router = useRouter();
  const action = gasReadingMutationKind(row.reading_id) === "update" ? updateAction : createAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [currentReading, setCurrentReading] = useState(row.current_reading == null ? "" : String(row.current_reading));
  const [readingDate, setReadingDate] = useState(row.reading_date ?? "");
  const lastCanonicalRef = useRef({
    readingId: row.reading_id,
    currentReading: row.current_reading,
    readingDate: row.reading_date,
  });
  const lastSuccessRef = useRef<string | null>(null);
  const lastCommittedRef = useRef({ currentReading, readingDate });
  const formRef = useRef<HTMLFormElement | null>(null);
  const submittingRef = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!pending) submittingRef.current = false;
  }, [pending]);

  useEffect(() => {
    const nextCanonical = {
      readingId: row.reading_id,
      currentReading: row.current_reading,
      readingDate: row.reading_date,
    };
    const nextDraft = reconcileGasReadingDraft(lastCanonicalRef.current, nextCanonical, { currentReading, readingDate });
    lastCanonicalRef.current = nextCanonical;
    if (nextDraft.currentReading === currentReading && nextDraft.readingDate === readingDate) return;
    setCurrentReading(nextDraft.currentReading);
    setReadingDate(nextDraft.readingDate);
    lastCommittedRef.current = nextDraft;
  }, [currentReading, readingDate, row.current_reading, row.reading_date, row.reading_id]);

  useEffect(() => {
    if (!state.values) return;
    const nextReading = state.values.current_reading ?? (row.current_reading == null ? "" : String(row.current_reading));
    const nextDate = state.values.reading_date ?? row.reading_date ?? "";
    setCurrentReading(nextReading);
    setReadingDate(nextDate);
    lastCommittedRef.current = { currentReading: nextReading, readingDate: nextDate };
  }, [row.current_reading, row.reading_date, state.values]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  function submitIfChanged() {
    if (submittingRef.current) return;
    const committed = lastCommittedRef.current;
    if (!shouldSubmitGasReading(committed, { currentReading, readingDate }, pending)) return;
    submittingRef.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="contents">
      <input type="hidden" name="unit_id" value={row.unit_id} />
      <input type="hidden" name="reading_month" value={monthKeyToDate(selectedMonthKey)} />
      {row.reading_id ? <input type="hidden" name="reading_id" value={row.reading_id} /> : null}
      <input type="hidden" name="notes" value="" />
      <div className="px-4 py-4">
        <div className="font-medium text-zinc-950">{row.unit_number}</div>
        {row.floor ? <div className="text-xs text-zinc-500">Floor {row.floor}</div> : null}
      </div>
      <div className="px-4 py-4">
        {monthEditable ? (
          <Input
            name="current_reading"
            type="number"
            step="0.001"
            min="0"
            value={currentReading}
            onChange={(event) => setCurrentReading(event.target.value)}
            onBlur={submitIfChanged}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitIfChanged();
              }
            }}
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm"
          />
        ) : (
          <div className="text-sm text-zinc-600">{readingValue(row.current_reading)}</div>
        )}
        {fieldError("current_reading", state) ? <p className="mt-2 text-xs text-red-600">{fieldError("current_reading", state)}</p> : null}
      </div>
      <div className="px-4 py-4 text-sm text-zinc-600">{readingValue(row.previous_reading)}</div>
      <div className="px-4 py-4 text-sm text-zinc-600">{consumption == null ? "—" : readingValue(consumption)}</div>
      <div className="px-4 py-4">
        {monthEditable ? (
          <Input
            name="reading_date"
            type="date"
            value={readingDate}
            onChange={(event) => setReadingDate(event.target.value)}
            onBlur={submitIfChanged}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitIfChanged();
              }
            }}
          />
        ) : (
          <div className="text-sm text-zinc-600">{row.reading_date ? formatPeruvianDate(row.reading_date) : "—"}</div>
        )}
        {monthEditable && pending ? <p className="mt-2 text-xs text-zinc-500">Saving...</p> : null}
        {fieldError("reading_date", state) ? <p className="mt-2 text-xs text-red-600">{fieldError("reading_date", state)}</p> : null}
      </div>
      {state.error && !state.fieldErrors ? <p className="col-span-full px-4 pb-3 text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}

export function GasReadingLedgerPanel({ createAction, updateAction, selectedMonthKey, monthOptions, rows, isCurrentMonth, monthEditable }: Props) {
  const [query, setQuery] = useState("");
  const completedCount = rows.filter((row) => row.has_reading).length;
  const currentMonthComplete = isCurrentMonth && monthEditable && rows.length > 0 && completedCount === rows.length;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = normalizedQuery
    ? rows.filter((row) => `${row.unit_number} ${row.floor ?? ""}`.toLowerCase().includes(normalizedQuery))
    : rows;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 my-12 px-6">
        <MonthLedgerSelector
          activeMonthKey={selectedMonthKey}
          searchQuery=""
          monthOptions={monthOptions}
          routeBase="/gas/unit-gas-readings"
        />
        <div className="flex items-center gap-3">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search Gas readings"
          className="h-12 w-full min-w-0 rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 xl:w-lg"
        />
        <Link
          href={`/gas/unit-gas-readings/${selectedMonthKey}/template`}
          className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 transition hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
        >
          <DownloadSimple size={18} aria-hidden="true" />
          Template
        </Link>
        </div>
      </div>

      <Panel className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-950">Gas Readings</h2>
          <p className="text-sm text-zinc-600">{completedCount} of {rows.length} complete</p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className={`${GAS_LEDGER_GRID_CLASS} border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-950`}>
              <div>Unit</div>
              <div>Current</div>
              <div>Previous</div>
              <div>Consumption</div>
              <div>Reading Date</div>
            </div>
            <div className="divide-y divide-zinc-200 bg-white">
              {visibleRows.map((row) => (
                <div key={row.unit_id} className={`${GAS_LEDGER_GRID_CLASS} items-start`}>
                  <GasReadingRow createAction={createAction} updateAction={updateAction} row={row} selectedMonthKey={selectedMonthKey} monthEditable={monthEditable} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>
      {isCurrentMonth && monthEditable && currentMonthComplete ? (
        <GasStartOverButton month={selectedMonthKey} readingCount={completedCount} />
      ) : null}
    </div>
  );
}

function GasStartOverButton({ month, readingCount }: { month: string; readingCount: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<GasFormState, FormData>(
    clearCurrentGasMonthAction.bind(null, month),
    initialState,
  );
  const formRef = useRef<HTMLFormElement | null>(null);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 sm:bottom-6 sm:right-6">
        <form ref={formRef} action={formAction} className="flex items-center justify-end gap-2">
          {state.error ? <span className="text-sm text-red-700">{state.error}</span> : null}
          <Button type="button" variant="primary" shape="pill" className="shadow-lg" disabled={pending} onClick={() => setOpen(true)}>
            Start over
          </Button>
        </form>
      </div>
      <Dialog
        open={open}
        title={`Start over ${monthName} readings?`}
        onOpenChange={setOpen}
        className="m-auto w-full max-w-sm rounded-2xl"
        contentClassName="w-full"
      >
        <div className="space-y-6">
          <p className="text-sm text-zinc-600">
            This will permanently erase all {readingCount} {monthName} Gas meter readings. This cannot be undone.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" shape="pill" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              shape="pill"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              {pending ? "Starting over..." : "Start over"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
