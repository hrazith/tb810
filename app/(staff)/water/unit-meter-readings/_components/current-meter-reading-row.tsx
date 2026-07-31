"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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
};

const initialState: FormState = {};

function readingValue(value: number | null | undefined) {
  if (value == null) return "";
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export function CurrentMeterReadingRow({ row, action, deleteAction, readOnly = false }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteAction, initialState);
  const [currentReading, setCurrentReading] = useState(readingValue(row.reading_end));
  const [readingDate, setReadingDate] = useState(row.reading_date);
  const lastCommittedRef = useRef({ currentReading: readingValue(row.reading_end), readingDate: row.reading_date });
  const formRef = useRef<HTMLFormElement | null>(null);
  const formId = `unit-meter-reading-${row.id}`;
  const deleteFormId = `unit-meter-reading-delete-${row.id}`;

  useEffect(() => {
    if (!state.values) return;
    const nextReading = state.values.reading_end ?? readingValue(row.reading_end);
    const nextDate = state.values.reading_date ?? row.reading_date;
    setCurrentReading(nextReading);
    setReadingDate(nextDate);
    lastCommittedRef.current = { currentReading: nextReading, readingDate: nextDate };
  }, [row.reading_date, row.reading_end, state.values]);

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
      <div className={`${LEDGER_GRID_CLASS} border-b border-zinc-100 px-4 py-4`}>
        <div className="text-sm font-medium text-zinc-950">{row.unit_number}</div>
        <div>
          {readOnly ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {readingValue(row.reading_end)}
            </div>
          ) : (
            <input
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
              className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
            />
          )}
        </div>
        <div className="text-sm text-zinc-600">{previous == null ? "—" : readingValue(previous)}</div>
        <div className="text-sm text-zinc-600">{consumption == null ? "—" : readingValue(consumption)}</div>
        <div>
          {readOnly ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {new Date(`${row.reading_date}T00:00:00Z`).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </div>
          ) : (
            <>
              <form ref={formRef} id={formId} action={formAction} className="hidden">
                <input type="hidden" name="reading_id" value={row.id} />
                <input type="hidden" name="unit_id" value={row.unit_id} />
                <input type="hidden" name="status" value={row.status} />
                <input type="hidden" name="notes" value={row.notes ?? ""} />
              </form>
              <input
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
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
              />
              {pending ? <p className="mt-2 text-xs text-zinc-500">Saving...</p> : null}
              {state.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
            </>
          )}
        </div>
        <div className="flex items-start justify-end">
          {readOnly ? null : (
            <>
              <form id={deleteFormId} action={deleteFormAction} className="hidden">
                <input type="hidden" name="reading_id" value={row.id} />
              </form>
              <Button
                type="submit"
                form={deleteFormId}
                variant="destructive"
                size="sm"
                onClick={(event) => {
                  const confirmed = window.confirm(
                    `Delete meter reading for Unit ${row.unit_number}?\n\nThis will permanently remove the reading dated ${new Date(`${row.reading_date}T00:00:00Z`).toLocaleDateString(
                      "en-US",
                      {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      },
                    )}.`,
                  );
                  if (!confirmed) {
                    event.preventDefault();
                  }
                }}
                disabled={pending || deletePending}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
      {!readOnly && deleteState.error ? (
        <p className="px-4 py-2 text-sm text-red-600">{deleteState.error}</p>
      ) : null}
    </>
  );
}
