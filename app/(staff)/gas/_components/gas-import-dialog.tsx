"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { GasFormState } from "@/server/gas/actions";

type Props = {
  action: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
  targetMonth: string;
  floating?: boolean;
};

const initialState: GasFormState = {};

export function GasImportDialog({ action, targetMonth, floating = false }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [fileSelected, setFileSelected] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const review = state.review;
  const expectedUnitCount = review?.expectedUnitCount ?? 0;
  const readingCount = review?.readingMatches ?? 0;
  const ready = Boolean(
    review?.readingSheetDetected &&
      expectedUnitCount > 0 &&
      readingCount === expectedUnitCount &&
      review.missingUnitNumbers?.length === 0 &&
      review.invalidRows.length === 0 &&
      review.duplicateRows.length === 0 &&
      review.unresolvedUnitNumbers.length === 0,
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStep(1);
      setFileSelected(false);
      setSelectedFileName(null);
    }
  }, []);
  useEffect(() => {
    if (pending || !state.success || state.review) return;
    router.refresh();
    queueMicrotask(() => handleOpenChange(false));
  }, [handleOpenChange, pending, router, state.review, state.success]);

  const issueMessages = review ? summarizeReadingIssues(review) : [];
  const confirmedReadings = review?.rows
    .filter((row) => row.kind === "reading")
    .map((row) => ({
      unit_number: row.data["Unit"] ?? row.data["Unidad"] ?? row.data["Unit Number"],
      current_reading: row.data["Current Reading"] ?? row.data["Lectura"] ?? row.data["Reading"],
      reading_date: row.data["Reading Date"] ?? row.data["Fecha"] ?? row.data["Date"],
    })) ?? [];

  return (
    <>
      <div className={floating ? "fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6" : undefined}>
        <Button type="button" variant={floating ? "primary" : "secondary"} shape="pill" className={floating ? "shadow-lg" : undefined} onClick={() => setOpen(true)}>
          {floating ? "+ Upload readings" : "Upload readings"}
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title={step === 1 ? "Upload readings" : "Review readings"}
        className="m-auto w-full max-w-3xl rounded-2xl"
        contentClassName="w-full"
      >
        <form
          action={formAction}
          className="space-y-6"
          onSubmit={(event) => {
            const file = fileInputRef.current?.files?.[0];
            if (step === 1) {
              if (!file) {
                event.preventDefault();
                return;
              }
              setStep(2);
              return;
            }
          }}
        >
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-sm text-zinc-500 transition hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              aria-label="Return to upload readings"
            >
              <span aria-hidden="true">‹</span> Back
            </button>
          ) : <p className="text-sm text-zinc-500">Step 1 of 2</p>}

          <input
            ref={fileInputRef}
            type="file"
            name="workbook"
            accept=".xlsx"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              setFileSelected(Boolean(file));
              setSelectedFileName(file?.name ?? null);
            }}
          />

          {step === 1 ? (
            <>
              <button
                type="button"
                className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center transition hover:border-zinc-950 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (!file) return;
                  setFileSelected(true);
                  setSelectedFileName(file.name);
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);
                  if (fileInputRef.current) fileInputRef.current.files = dataTransfer.files;
                }}
              >
                <div className="text-sm font-medium text-zinc-950">Drop readings workbook here</div>
                <div className="text-sm text-zinc-600">or click to choose a file</div>
                {selectedFileName ? <div className="text-xs text-zinc-500">{selectedFileName}</div> : null}
              </button>
              {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
              <div className="flex items-center justify-end gap-3">
                <Button type="button" variant="secondary" shape="pill" onClick={() => handleOpenChange(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" shape="pill" disabled={pending || !fileSelected}>
                  {pending ? "Reviewing..." : "Review"}
                </Button>
              </div>
            </>
          ) : null}

          {step === 2 && review ? (
            <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <div>
                <div className="text-base font-semibold text-zinc-950">{Math.min(readingCount, expectedUnitCount)} of {expectedUnitCount} units are ready</div>
                <div className={ready ? "text-emerald-700" : "text-red-700"}>
                  {ready ? "All readings are complete and ready to import." : "Complete the Gas readings before importing."}
                </div>
              </div>
              {issueMessages.length ? (
                <ul className="space-y-1 text-red-700">
                  {issueMessages.map((message) => <li key={message}>{message}</li>)}
                </ul>
              ) : null}
              {state.error ? <p className="text-red-700">{state.error}</p> : null}
            </div>
          ) : null}

          {step === 2 && review ? (
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" shape="pill" onClick={() => handleOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              {ready ? (
                <>
                  <input type="hidden" name="confirmed_readings" value={JSON.stringify(confirmedReadings)} />
                  <Button type="submit" name="confirmed" value="true" variant="primary" shape="pill" disabled={pending}>
                    {pending ? "Importing..." : `Import ${expectedUnitCount} readings`}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          <input type="hidden" name="target_reading_month" value={targetMonth} />
        </form>
      </Dialog>
    </>
  );
}

function summarizeReadingIssues(review: NonNullable<GasFormState["review"]>) {
  const messages = new Map<string, number>();
  for (const unitNumber of review.missingUnitNumbers ?? []) {
    messages.set(`Unit ${unitNumber} is missing a reading.`, 1);
  }
  for (const issue of [...review.invalidRows, ...review.duplicateRows, ...review.unresolvedUnitNumbers, ...review.unmatchedRows]) {
    const reason = issue.reason.includes("missing required reading date")
      ? "Reading Date and Current reading are required."
      : issue.reason.includes("did not resolve to a gas-enabled condo")
        ? "Unit could not be matched to the eligible Gas roster."
        : issue.reason.includes("appears more than once")
          ? "The Unit appears more than once."
          : issue.reason;
    const message = `Row ${issue.sourceRowNumber}: ${reason}`;
    messages.set(message, (messages.get(message) ?? 0) + 1);
  }
  return Array.from(messages, ([message, count]) => count > 1 ? `${message} (${count} rows)` : message);
}
