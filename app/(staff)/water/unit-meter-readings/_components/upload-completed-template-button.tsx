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
      }>;
    };
  };
};

const initialState: FormState = {};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

type Props = {
  className?: string;
};

export function UploadCompletedTemplateButton({ className }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(uploadCompletedTemplateAction, initialState);
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
        description="Choose a completed `.xlsx` template to start the canonical import workflow."
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
            <div className="text-sm font-medium text-zinc-950">Drag and drop your completed template here</div>
            <div className="text-sm text-zinc-600">or click to choose an `.xlsx` file</div>
            <div className="text-xs text-zinc-500">
              The file will be validated after upload in a later sprint.
            </div>
            <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
              {selectedFileName ?? "No file selected"}
            </div>
          </button>

          <div className="space-y-2">
            {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
            {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
          </div>

          {state.summary ? (
            <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Workbook</div>
                  <div className="mt-1 font-medium text-zinc-950">{state.summary.fileName}</div>
                  <div className="text-zinc-600">Successfully opened</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Worksheet</div>
                  <div className="mt-1 font-medium text-zinc-950">{state.summary.selectedWorksheet.name}</div>
                  <div className="text-zinc-600">{state.summary.selectedWorksheet.rowCount} rows parsed</div>
                  <div className="text-zinc-600">{state.summary.selectedWorksheet.blankReadingCount} blank readings</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Canonical columns</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {state.summary.selectedWorksheet.canonicalColumns.map((column) => (
                    <span
                      key={column}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700"
                    >
                      {column}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Mapped columns</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {Object.entries(state.summary.selectedWorksheet.mappedColumns).map(([canonical, source]) => (
                    <div key={canonical} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                      <span className="font-medium text-zinc-950">{canonical}</span>
                      <span className="text-zinc-500"> ← </span>
                      <span>{source}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">First five parsed rows</div>
                <div className="mt-3 space-y-2">
                  {state.summary.selectedWorksheet.parsedRows.map((row) => (
                    <div key={row.sourceRowNumber} className="rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                        Row {row.sourceRowNumber}
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <span className="text-zinc-500">Unit:</span> {row.unitNumber ?? "—"}
                        </div>
                        <div>
                          <span className="text-zinc-500">Reading:</span>{" "}
                          {row.readingEnd == null ? "—" : row.readingEnd}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
              {pending ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
