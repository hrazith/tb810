"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { uploadCompletedTemplateAction } from "../actions";

type FormState = {
  success?: string;
  error?: string;
  summary?: {
    fileName: string;
    worksheets: string[];
    selectedWorksheet: {
      name: string;
      rowCount: number;
      canonicalColumns: string[];
      mappedColumns: Record<string, string>;
      blankReadingCount: number;
      parsedRows: Array<{
        sourceRowNumber: number;
        unitNumber: string;
        readingEnd: number | null;
        readingText: string | null;
      }>;
    };
  };
  validation?: {
    monthKey: string;
    expectedUnitCount: number;
    uploadedRowCount: number;
    ignoredBlankRowCount: number;
    acceptedRowCount: number;
    newRowCount: number;
    updatedRowCount: number;
    rejectedRowCount: number;
    completedUnitCountBefore: number;
    completedUnitCountAfter: number;
    remainingUnitCount: number;
    completionPercentage: number;
    acceptedRows: Array<{
      sourceRowNumber: number;
      unitNumber: string;
      readingEnd: number;
      unitId: string;
      previousReading: number | null;
      existingReadingId: string | null;
    }>;
    rejectedRows: Array<{
      code: string;
      message: string;
      sourceRowNumber?: number;
      unitNumber?: string;
      sourceRowNumbers?: number[];
    }>;
    canonicalColumns: string[];
  };
};

const initialState: FormState = {};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

type Props = {
  month: string;
  className?: string;
};

export function UploadCompletedTemplateButton({ month, className }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    uploadCompletedTemplateAction.bind(null, month),
    initialState,
  );
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!open) {
      setSelectedFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open]);

  useEffect(() => {
    if (state.success) {
      setOpen(false);
    }
  }, [state.success]);

  return (
    <>
      <Button
        type="button"
        variant="primary"
        shape="pill"
        className={className}
        onClick={() => setOpen(true)}
      >
        Upload Completed Template
      </Button>

      <Dialog
        open={open}
        title="Upload Completed Template"
        description="Choose the approved `lecturas.xlsx` workbook to process the month."
        onOpenChange={setOpen}
        descriptionClassName="text-sm text-zinc-600"
      >
        <form
          action={formAction}
          className="space-y-5"
          onSubmit={(event) => {
            const file = fileInputRef.current?.files?.[0] ?? null;
            if (!file) {
              event.preventDefault();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            name="template"
            accept=".xlsx"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              setSelectedFileName(file?.name ?? null);
            }}
          />

          <button
            type="button"
            className={joinClasses(
              "flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center transition hover:border-zinc-950 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2",
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (!file) return;
              setSelectedFileName(file.name);
              const dt = new DataTransfer();
              dt.items.add(file);
              if (fileInputRef.current) {
                fileInputRef.current.files = dt.files;
              }
            }}
          >
            <div className="text-sm font-medium text-zinc-950">Drag and drop lecturas.xlsx here</div>
            <div className="text-sm text-zinc-600">or click to choose the workbook</div>
            <div className="text-xs text-zinc-500">The file is checked in memory before anything is written.</div>
            <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
              {selectedFileName ?? "No file selected"}
            </div>
          </button>

          <div className="space-y-2">
            {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
            {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
          </div>

          {state.validation ? (
            <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <div className="space-y-4">
                <div className="text-base font-semibold text-zinc-950">File processed successfully.</div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>{state.validation.acceptedRowCount} supplied readings accepted</div>
                  <div>{state.validation.newRowCount} new readings</div>
                  <div>{state.validation.updatedRowCount} existing readings updated</div>
                  <div>{state.validation.completedUnitCountAfter} of {state.validation.expectedUnitCount} Units complete</div>
                  <div>{state.validation.completionPercentage}% complete</div>
                  <div>{state.validation.ignoredBlankRowCount} blank Lectura rows ignored</div>
                </div>
                {state.validation.rejectedRows.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-zinc-950">{state.validation.rejectedRows.length} readings could not be processed.</div>
                    <ul className="space-y-1 text-sm text-red-700">
                      {state.validation.rejectedRows.map((issue: { code: string; message: string }, index: number) => (
                        <li key={`${issue.code}-${index}`}>• {issue.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="text-sm text-zinc-600">The workbook was checked in memory only.</div>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" shape="pill" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              shape="pill"
              disabled={pending || !selectedFileName}
            >
              {pending ? "Processing..." : "Process File"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
