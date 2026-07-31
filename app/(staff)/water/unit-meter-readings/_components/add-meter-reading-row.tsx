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

export function AddMeterReadingRow({ action, units, readingDate, previousByUnitId }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [unitText, setUnitText] = useState("");
  const [currentReading, setCurrentReading] = useState("");
  const [date, setDate] = useState(readingDate);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const submittedUnitLabelRef = useRef<string | null>(null);
  const wasPendingRef = useRef(false);
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
    if (pending) {
      wasPendingRef.current = true;
      return;
    }

    if (!wasPendingRef.current) {
      return;
    }

    wasPendingRef.current = false;

    if (!state.success) {
      return;
    }

    setSuccessMessage(
      submittedUnitLabelRef.current ? `Reading added for ${submittedUnitLabelRef.current}.` : "Reading added.",
    );
    setUnitText("");
    setCurrentReading("");
    setDate(readingDate);
    submittedUnitLabelRef.current = null;
  }, [pending, readingDate, state.success]);

  useEffect(() => {
    if (state.error) {
      setSuccessMessage(null);
    }
  }, [state.error]);

  return (
    <>
        <form
        ref={formRef}
        id={formId}
        action={formAction}
        className="hidden"
        onSubmit={() => {
          submittedUnitLabelRef.current = matchedUnit ? `Unit ${matchedUnit.unit_number}` : null;
        }}
      />
      <div className={`${LEDGER_GRID_CLASS} border-b border-zinc-100 px-4 py-4 inset-shadow-sm inset-shadow-indigo-500/50 bg-gray-100`}>
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
      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {successMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}
    </>
  );
}
