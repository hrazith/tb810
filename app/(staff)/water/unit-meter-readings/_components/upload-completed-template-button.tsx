"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { clearCurrentUnitWaterMonthAction, confirmCompletedTemplateAction, uploadCompletedTemplateAction, type ImportFormState } from "../actions";

const initialState: ImportFormState = {};

function monthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${monthKey}-01T00:00:00Z`),
  );
}

function readingText(value: number | null) {
  return value == null ? "—" : value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

type Props = {
  month: string;
  currentReadingCount: number;
  expectedReadingCount: number;
  className?: string;
};

export function DownloadTemplateLink() {
  return (
    <Link
      href="/water/unit-meter-readings/template"
      className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 transition hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
    >
      <DownloadSimple size={18} aria-hidden="true" />
      Template
    </Link>
  );
}

export function UploadCompletedTemplateButton({ month, currentReadingCount, expectedReadingCount, className }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ImportFormState, FormData>(
    uploadCompletedTemplateAction.bind(null, month),
    initialState,
  );
  const [confirmState, confirmAction, confirming] = useActionState<ImportFormState, FormData>(
    confirmCompletedTemplateAction.bind(null, month),
    initialState,
  );
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [readingDate, setReadingDate] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const startOverFormRef = useRef<HTMLFormElement | null>(null);

  function close() {
    setOpen(false);
    setStep(1);
    setSelectedFileName(null);
    setReadingDate("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => {
    if (!confirmState.success) return;
    const timer = window.setTimeout(close, 0);
    return () => window.clearTimeout(timer);
  }, [confirmState.success]);

  const validation = state.validation;
  const previewRows = state.previewRows ?? [];
  const ready = Boolean(
    validation &&
      validation.rejectedRows.length === 0 &&
      validation.acceptedRows.length === validation.expectedUnitCount,
  );
  const visibleStep = validation ? step : 1;
  const currentMonthComplete = currentReadingCount === expectedReadingCount;
  const endOfMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

  return (
    <>
      <div className={className ?? "fixed bottom-4 right-4 z-40 flex items-center gap-3 sm:bottom-6 sm:right-6"}>
        {currentMonthComplete ? (
          <StartOverButton
            month={month}
            readingCount={currentReadingCount}
            open={startOverOpen}
            onOpenChange={setStartOverOpen}
            formRef={startOverFormRef}
          />
        ) : (
          <Button type="button" variant="primary" shape="pill" className="shadow-lg" onClick={() => setOpen(true)}>
            + Upload readings
          </Button>
        )}
      </div>

      <Dialog
        open={open}
        title={visibleStep === 1 ? "Upload readings" : "Review readings"}
        className="m-auto w-full max-w-3xl rounded-2xl"
        onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}
        contentClassName="w-full"
      >
        <form
          action={formAction}
          className="space-y-6"
          onSubmit={(event) => {
            if (!fileInputRef.current?.files?.[0]) {
              event.preventDefault();
              return;
            }
            setStep(2);
          }}
        >
          {visibleStep === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-sm text-zinc-500 transition hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
                aria-label="Return to upload readings"
              >
              <span aria-hidden="true">‹</span> Back
            </button>
          ) : <p className="text-sm text-zinc-500">Step 1 of 2</p>}

          {visibleStep === 1 ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                name="template"
                accept=".xlsx"
                className="sr-only"
                onChange={(event) => setSelectedFileName(event.currentTarget.files?.[0]?.name ?? null)}
              />
              <button
                type="button"
                className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center transition hover:border-zinc-950 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (!file) return;
                  setSelectedFileName(file.name);
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);
                  if (fileInputRef.current) fileInputRef.current.files = dataTransfer.files;
                }}
              >
                <div className="text-sm font-medium text-zinc-950">Drop completed template here</div>
                <div className="text-sm text-zinc-600">or click to choose a file</div>
                {selectedFileName ? <div className="text-xs text-zinc-500">{selectedFileName}</div> : null}
              </button>
              {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
              <div className="flex items-center justify-end gap-3">
                <Button type="button" variant="secondary" shape="pill" onClick={close} disabled={pending || confirming}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" shape="pill" disabled={pending || confirming || !selectedFileName}>
                  {pending ? "Reviewing..." : "Review"}
                </Button>
              </div>
            </>
          ) : null}
        </form>

        {visibleStep === 2 && validation ? (
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <div>
              <div className="text-base font-semibold text-zinc-950">{validation.acceptedRowCount} of {validation.expectedUnitCount} units ready</div>
              <div className={ready ? "text-emerald-700" : "text-red-700"}>
                {ready
                  ? "All readings are complete and ready to import."
                  : validation.uploadedRowCount > validation.expectedUnitCount
                    ? `There are ${validation.uploadedRowCount - validation.expectedUnitCount} more entries than expected.`
                    : validation.acceptedRowCount < validation.expectedUnitCount
                      ? `${validation.expectedUnitCount - validation.acceptedRowCount} ${validation.expectedUnitCount - validation.acceptedRowCount === 1 ? "unit still needs a reading" : "units still need readings"}.`
                      : `${validation.rejectedRows.length} need attention.`}
              </div>
            </div>
            {!ready && validation.acceptedRowCount < validation.expectedUnitCount && validation.rejectedRows.length === 0 ? (
              <p>Complete the missing entries in your spreadsheet and upload it again.</p>
            ) : null}
            {validation.existingRowCount > 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                {validation.existingRowCount} current-month readings will be updated after confirmation.
              </p>
            ) : null}
            {validation.rejectedRows.length ? (
              <ul className="space-y-1 text-red-700">
                {validation.rejectedRows.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
              </ul>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white">
                <div className="grid grid-cols-4 gap-3 border-b border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <div>Unit</div><div>Previous</div><div>New Reading</div><div>Consumption</div>
                </div>
                {previewRows.map((row) => (
                  <div key={row.unitId} className="grid grid-cols-4 gap-3 border-b border-zinc-100 px-3 py-2 last:border-0">
                    <div>{row.unitNumber}</div>
                    <div>{readingText(row.previousReading)}</div>
                    <div>{readingText(row.readingEnd)}</div>
                    <div>{row.previousReading == null ? "—" : readingText(row.readingEnd - row.previousReading)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {visibleStep === 2 && ready ? (
          <form action={confirmAction} className="space-y-4">
            <input type="hidden" name="preview_rows" value={JSON.stringify(previewRows)} />
            {currentReadingCount > 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                This will replace all {currentReadingCount} current-month readings. Your existing {monthLabel(month)} readings will be erased and replaced with the readings in this file.
              </p>
            ) : null}
            {validation?.rowDateMode === "row" ? (
              <p className="text-sm text-zinc-600">Reading dates will be taken from the workbook.</p>
            ) : (
              <label className="block space-y-2 text-sm font-medium text-zinc-950">
                Reading date
                <input
                  name="reading_date"
                  type="date"
                  required
                  value={readingDate}
                  min={`${month}-01`}
                  max={endOfMonth}
                  onChange={(event) => setReadingDate(event.target.value)}
                  className="block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-950 focus:border-zinc-950 focus:outline-none"
                />
              </label>
            )}
            {confirmState.error ? <p className="text-sm text-red-700">{confirmState.error}</p> : null}
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" shape="pill" onClick={close} disabled={confirming}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" shape="pill" disabled={confirming || (validation?.rowDateMode === "none" && !readingDate)}>
                {confirming ? "Saving..." : currentReadingCount > 0 ? `Replace with ${validation?.expectedUnitCount ?? 0} readings` : `Import ${validation?.expectedUnitCount ?? 0} readings`}
              </Button>
            </div>
          </form>
        ) : null}
        {visibleStep === 2 && validation && !ready ? (
          <div className="flex justify-end">
            <Button type="button" variant="secondary" shape="pill" onClick={close} disabled={pending || confirming}>
              Cancel
            </Button>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function StartOverButton({
  month,
  readingCount,
  open,
  onOpenChange,
  formRef,
}: {
  month: string;
  readingCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formRef: RefObject<HTMLFormElement | null>;
}) {
  const [state, formAction, pending] = useActionState<ImportFormState, FormData>(
    clearCurrentUnitWaterMonthAction.bind(null, month),
    initialState,
  );
  const monthName = monthLabel(month);

  return (
    <>
      <form ref={formRef} action={formAction} className="flex items-center gap-2">
        {state.error ? <span className="text-sm text-red-700">{state.error}</span> : null}
        {state.success ? <span className="text-sm text-emerald-700">{state.success}</span> : null}
        <Button type="button" variant="primary" shape="pill" disabled={pending} onClick={() => onOpenChange(true)}>
          Start over
        </Button>
      </form>
      <Dialog
        open={open}
        title={`Start over ${monthName} readings?`}
        onOpenChange={onOpenChange}
        className="m-auto w-full max-w-sm rounded-2xl"
        contentClassName="w-full"
      >
        <div className="space-y-6">
          <p className="text-sm text-zinc-600">
            This will permanently erase all {readingCount} {monthName} readings.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" shape="pill" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              shape="pill"
              disabled={pending}
              onClick={() => {
                onOpenChange(false);
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
