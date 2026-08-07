"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { GasFormState } from "@/server/gas/actions";

type Props = {
  action: (prev: GasFormState, formData: FormData) => Promise<GasFormState>;
};

const initialState: GasFormState = {};

export function GasImportDialog({ action }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open && fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  return (
    <>
      <Button type="button" variant="secondary" shape="pill" onClick={() => setOpen(true)}>
        Import Workbook
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Import Gas Workbook"
        description="Upload the spreadsheet used to capture bills and gas readings."
      >
        <form action={formAction} className="space-y-4">
          <input ref={fileInputRef} type="file" name="workbook" accept=".xlsx" className="block w-full text-sm" />
          {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
          {state.review ? (
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <p className="font-medium text-zinc-900">Preflight review</p>
              <p>Supplier bills matched: {state.review.billMatches}</p>
              <p>Gas readings matched: {state.review.readingMatches}</p>
              <p>Unmatched rows: {state.review.unmatchedRows.length}</p>
              <p>Invalid rows: {state.review.invalidRows.length}</p>
              <p>Duplicate rows: {state.review.duplicateRows.length}</p>
              <p>Unresolved Unit numbers: {state.review.unresolvedUnitNumbers.length}</p>
              {state.review.unmatchedRows.length || state.review.invalidRows.length || state.review.duplicateRows.length || state.review.unresolvedUnitNumbers.length ? (
                <div className="space-y-1">
                  <p className="font-medium text-zinc-900">Skipped rows</p>
                  {[...state.review.unmatchedRows, ...state.review.invalidRows, ...state.review.duplicateRows, ...state.review.unresolvedUnitNumbers].map((issue) => (
                    <p key={`${issue.sourceRowNumber}-${issue.reason}`}>
                      Row {issue.sourceRowNumber}: {issue.reason}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" shape="pill" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {state.review ? <input type="hidden" name="confirmed" value="true" /> : null}
            <Button type="submit" variant="primary" shape="pill" disabled={pending}>
              {pending ? (state.review ? "Importing..." : "Reviewing...") : state.review ? "Confirm Import" : "Review Workbook"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
