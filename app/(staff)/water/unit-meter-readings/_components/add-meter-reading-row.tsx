"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { LEDGER_GRID_CLASS } from "./ledger-layout";

type FormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

type UnitOption = { id: string; unit_number: string; floor: string | null };

type AddedRow = {
  id: string;
  unit_label: string;
  current_reading: string;
  previous_reading: string;
  consumption: string;
  reading_date: string;
};

type Props = {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  units: UnitOption[];
  readingDate: string;
  previousByUnitId: Record<string, { previous_reading: number | null; previous_reading_date: string | null }>;
};

const initialState: FormState = {};

function readingValue(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AddMeterReadingRow({ action, units, readingDate, previousByUnitId }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [unitText, setUnitText] = useState("");
  const [currentReading, setCurrentReading] = useState("");
  const [date, setDate] = useState(readingDate);
  const [recentRows, setRecentRows] = useState<AddedRow[]>([]);
  const lastSuccessRef = useRef<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement | null>(null);
  const formId = "unit-meter-reading-add-row";

  const matchedUnit = useMemo(
    () => units.find((unit) => `${unit.unit_number}${unit.floor ? ` - Floor ${unit.floor}` : ""}` === unitText) ?? null,
    [unitText, units],
  );
  const previous = matchedUnit ? previousByUnitId[matchedUnit.id]?.previous_reading ?? null : null;
  const consumption =
    previous == null || currentReading === "" || toNumber(currentReading) == null
      ? null
      : toNumber(currentReading)! - previous;

  useEffect(() => {
    if (!state.success || state.success === lastSuccessRef.current) return;
    if (!matchedUnit) return;
    lastSuccessRef.current = state.success;
    const current = toNumber(currentReading);
    setRecentRows((rows) => [
      {
        id: makeId(),
        unit_label: unitText,
        current_reading: readingValue(current),
        previous_reading: readingValue(previous),
        consumption: consumption == null ? "—" : readingValue(consumption),
        reading_date: date,
      },
      ...rows,
    ]);
    setUnitText("");
    setCurrentReading("");
    setDate(readingDate);
  }, [currentReading, date, matchedUnit, previous, readingDate, state.success, unitText, consumption]);

  return (
    <>
      <form ref={formRef} id={formId} action={formAction} className="hidden" />
      <div className={`${LEDGER_GRID_CLASS} border-b border-zinc-100 px-4 py-4`}>
        <div>
          <input type="hidden" name="unit_id" form={formId} value={matchedUnit?.id ?? ""} />
          <input type="hidden" name="reading_start" form={formId} value={previous == null ? "" : String(previous)} />
          <input type="hidden" name="reading_end" form={formId} value={currentReading} />
          <input type="hidden" name="reading_date" form={formId} value={date} />
          <input type="hidden" name="status" form={formId} value="recorded" />
          <input type="hidden" name="notes" form={formId} value="" />
          <input
            list="unit-options"
            value={unitText}
            onChange={(e) => setUnitText(e.target.value)}
            placeholder="Search unit"
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
          />
          <datalist id="unit-options">
            {units.map((unit) => {
              const label = `${unit.unit_number}${unit.floor ? ` - Floor ${unit.floor}` : ""}`;
              return (
                <option key={unit.id} value={label}>
                  {label}
                </option>
              );
            })}
          </datalist>
        </div>
        <div>
          <input
            form={formId}
            name="reading_end"
            type="number"
            min="0"
            step="0.001"
            inputMode="decimal"
            value={currentReading}
            onChange={(e) => setCurrentReading(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
          />
        </div>
        <div className="text-sm text-zinc-600">{readingValue(previous)}</div>
        <div className="text-sm text-zinc-600">{consumption == null ? "—" : readingValue(consumption)}</div>
        <div>
          <input
            form={formId}
            name="reading_date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
          />
        </div>
        <div className="flex items-center justify-end">
          <Button
            type="submit"
            form={formId}
            variant="primary"
            shape="pill"
            disabled={pending || !matchedUnit || currentReading === "" || date === ""}
          >
            Add
          </Button>
        </div>
      </div>
      {recentRows.map((row) => (
        <div key={row.id} className={`${LEDGER_GRID_CLASS} border-b border-zinc-100 px-4 py-4 bg-zinc-50`}>
          <div className="text-sm font-medium text-zinc-950">{row.unit_label}</div>
          <div className="text-sm text-zinc-600">{row.current_reading}</div>
          <div className="text-sm text-zinc-600">{row.previous_reading}</div>
          <div className="text-sm text-zinc-600">{row.consumption}</div>
          <div className="text-sm text-zinc-600">{row.reading_date}</div>
          <div />
        </div>
      ))}
    </>
  );
}
