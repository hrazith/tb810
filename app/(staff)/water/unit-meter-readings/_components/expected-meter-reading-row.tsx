"use client";

import { useActionState, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { LEDGER_GRID_CLASS } from "./ledger-layout";

type Props = {
  unitNumber: string;
  unitId: string;
  floor: string | null;
  previousReading: number | null;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
};

type FormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

function readingText(value: number | null) {
  return value == null ? "—" : value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function ExpectedMeterReadingRow({ unitNumber, unitId, floor, previousReading, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [currentReading, setCurrentReading] = useState("");
  const [readingDate, setReadingDate] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const formId = `unit-meter-reading-create-${unitId}`;

  function submitIfReady() {
    if (currentReading !== "" && readingDate !== "") formRef.current?.requestSubmit();
  }

  const consumption =
    previousReading == null || currentReading === "" || Number.isNaN(Number(currentReading))
      ? null
      : Number(currentReading) - previousReading;

  return (
    <div className={`${LEDGER_GRID_CLASS} border-b border-zinc-100 px-4 py-4`}>
      <div className="text-sm font-medium text-zinc-950">
        <div>{unitNumber}</div>
        {floor ? <div className="text-xs font-normal text-zinc-500">Floor {floor}</div> : null}
      </div>
      <div className="text-sm text-zinc-600">{readingText(previousReading)}</div>
      <form ref={formRef} id={formId} action={formAction} className="contents">
        <input type="hidden" name="unit_id" value={unitId} />
        <input type="hidden" name="reading_start" value={previousReading == null ? "" : String(previousReading)} />
        <input type="hidden" name="status" value="recorded" />
        <input type="hidden" name="notes" value="" />
        <Input
          name="reading_end"
          type="number"
          min="0"
          step="0.001"
          inputMode="decimal"
          value={currentReading}
          disabled={pending}
          onChange={(event) => setCurrentReading(event.target.value)}
          onBlur={submitIfReady}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm"
          aria-label={`Current reading for Unit ${unitNumber}`}
        />
        <div className="text-sm text-zinc-600">{consumption == null ? "—" : readingText(consumption)}</div>
        <Input
          name="reading_date"
          type="date"
          value={readingDate}
          disabled={pending}
          onChange={(event) => setReadingDate(event.target.value)}
          onBlur={submitIfReady}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          aria-label={`Reading date for Unit ${unitNumber}`}
        />
      </form>
      <div className="text-sm text-zinc-500">—</div>
      {state.error ? <p className="col-span-full text-xs text-red-600">{state.error}</p> : null}
    </div>
  );
}
