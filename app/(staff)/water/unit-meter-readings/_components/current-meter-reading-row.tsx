"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDevTools } from "@/components/dev-tools";
import { formatPeruvianDate } from "@/lib/water-dates";
import { LEDGER_GRID_CLASS } from "./ledger-layout";

type FormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

type Props = {
  row: {
    id: string;
    unit_id: string;
    unit_number: string;
    previous_reading: number | null;
    reading_end: number | null;
    reading_date: string;
    notes: string | null;
    status: string;
  };
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  deleteAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  readOnly?: boolean;
  historicalEditingAvailable?: boolean;
  packageCorrectionAvailable?: boolean;
  isHistoricalMonth?: boolean;
};

const initialState: FormState = {};

function readingValue(value: number | null | undefined) {
  if (value == null) return "";
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export function CurrentMeterReadingRow({
  row,
  action,
  deleteAction,
  readOnly = false,
  historicalEditingAvailable = false,
  packageCorrectionAvailable = false,
  isHistoricalMonth = false,
}: Props) {
  const { historicalEditingEnabled } = useDevTools();
  const [state, formAction, pending] = useActionState(action, initialState);
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteAction, initialState);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [currentReading, setCurrentReading] = useState(readingValue(row.reading_end));
  const [readingDate, setReadingDate] = useState(row.reading_date);
  const lastCommittedRef = useRef({ currentReading: readingValue(row.reading_end), readingDate: row.reading_date });
  const formRef = useRef<HTMLFormElement | null>(null);
  const formId = `unit-meter-reading-${row.id}`;
  const deleteFormId = `unit-meter-reading-delete-${row.id}`;
  const deleteFormRef = useRef<HTMLFormElement | null>(null);
  const canEditHistoricalReadings =
    isHistoricalMonth && (packageCorrectionAvailable || (historicalEditingAvailable && historicalEditingEnabled));
  const editable = !isHistoricalMonth && !readOnly;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!state.values) return;
    const nextReading = state.values.reading_end ?? readingValue(row.reading_end);
    const nextDate = state.values.reading_date ?? row.reading_date;
    setCurrentReading(nextReading);
    setReadingDate(nextDate);
    lastCommittedRef.current = { currentReading: nextReading, readingDate: nextDate };
  }, [row.reading_date, row.reading_end, state.values]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function submitIfChanged() {
    const committed = lastCommittedRef.current;
    if (committed.currentReading === currentReading && committed.readingDate === readingDate) return;
    formRef.current?.requestSubmit();
  }

  const previous = row.previous_reading;
  const consumption =
    previous == null || currentReading === "" || Number.isNaN(Number(currentReading))
      ? null
      : Number(currentReading) - previous;

  return (
    <>
      <div className={`${LEDGER_GRID_CLASS} group border-b border-zinc-100 px-4 py-4`}>
        <div className="text-sm font-medium text-zinc-950">{row.unit_number}</div>
        <div className="text-sm text-zinc-600">{previous == null ? "—" : readingValue(previous)}</div>
        <div>
          {editable ? (
            <>
              <form ref={formRef} id={formId} action={formAction} className="hidden">
                <input type="hidden" name="reading_id" value={row.id} />
                <input type="hidden" name="unit_id" value={row.unit_id} />
                <input type="hidden" name="status" value={row.status} />
                <input type="hidden" name="notes" value={row.notes ?? ""} />
                <input
                  type="hidden"
                  name="dev_historical_edit_enabled"
                  value={canEditHistoricalReadings ? "true" : "false"}
                />
              </form>
              <Input
                form={formId}
                name="reading_end"
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={currentReading}
                onChange={(e) => setCurrentReading(e.target.value)}
                onBlur={submitIfChanged}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm"
              />
            </>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {readingValue(row.reading_end)}
            </div>
          )}
        </div>
        <div className="text-sm text-zinc-600">{consumption == null ? "—" : readingValue(consumption)}</div>
        <div>
          {editable ? (
            <>
              <Input
                form={formId}
                name="reading_date"
                type="date"
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
                onBlur={submitIfChanged}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
              />
              {pending ? <p className="mt-2 text-xs text-zinc-500">Saving...</p> : null}
              {state.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
            </>
          ) : (
            <div className="text-sm text-zinc-600">{formatPeruvianDate(row.reading_date)}</div>
          )}
        </div>
        <div className="flex items-start justify-end">
          {editable ? (
            <>
              <form ref={deleteFormRef} id={deleteFormId} action={deleteFormAction} className="hidden">
                <input type="hidden" name="reading_id" value={row.id} />
                <input
                  type="hidden"
                  name="dev_historical_edit_enabled"
                  value={canEditHistoricalReadings ? "true" : "false"}
                />
              </form>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={pending || deletePending}
                className="cursor-pointer text-sm text-red-700 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>
      {editable && deleteState.error ? (
        <p className="px-4 py-2 text-sm text-red-600">{deleteState.error}</p>
      ) : null}
      <Dialog
        open={deleteConfirmOpen}
        title={`Delete Unit ${row.unit_number} reading?`}
        onOpenChange={setDeleteConfirmOpen}
        className="m-auto w-full max-w-sm rounded-2xl"
        contentClassName="w-full"
      >
        <div className="space-y-6">
          <p className="text-sm text-zinc-600">
            Deleting this reading will remove the {formatPeruvianDate(row.reading_date)} reading from the current operational month.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" shape="pill" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              shape="pill"
              disabled={deletePending}
              onClick={() => {
                setDeleteConfirmOpen(false);
                deleteFormRef.current?.requestSubmit();
              }}
            >
              {deletePending ? "Deleting..." : "Delete reading"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
