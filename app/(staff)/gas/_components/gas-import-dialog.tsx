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
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" shape="pill" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" shape="pill" disabled={pending}>
              {pending ? "Importing..." : "Import"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
