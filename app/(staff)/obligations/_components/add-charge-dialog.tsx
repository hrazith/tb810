"use client";

import { useState } from "react";
import { CurrencyDollar, DownloadSimple, Plus, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ChargeAction = (formData: FormData) => void | Promise<void>;

type TargetOption = {
  value: string;
  label: string;
};

type Props = {
  action: ChargeAction;
  returnTo: string;
  workingMonth: string;
  defaultTarget: string;
  defaultDescription?: string;
  defaultAmount?: string;
  units: Array<{ id: string; unit_number: string }>;
  owners: Array<{ id: string; full_name: string; owner_reference: string }>;
  showDownload?: boolean;
};

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function SubmitButton() {
  return (
    <Button type="submit" variant="primary" className="shrink-0">
      Save Charge
    </Button>
  );
}

export function AddChargeDialog({
  action,
  returnTo,
  workingMonth,
  defaultTarget,
  defaultDescription = "",
  defaultAmount = "",
  units,
  owners,
  showDownload = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(defaultTarget);
  const [schedule, setSchedule] = useState<"one_off" | "recurring">("one_off");
  const [amount, setAmount] = useState(defaultAmount);

  const broadTargetOptions: TargetOption[] = [
    { value: "all_units", label: `All ${units.length} units` },
    { value: "all_owners", label: `All ${owners.length} owners` },
  ];
  const contextualTarget = defaultTarget.startsWith("unit:")
    ? units.find((unit) => defaultTarget === `unit:${unit.id}`)
      ? { value: defaultTarget, label: `Unit ${units.find((unit) => defaultTarget === `unit:${unit.id}`)?.unit_number}` }
      : null
    : defaultTarget.startsWith("owner:")
      ? owners.find((owner) => defaultTarget === `owner:${owner.id}`)
        ? { value: defaultTarget, label: owners.find((owner) => defaultTarget === `owner:${owner.id}`)?.full_name ?? "Owner" }
        : null
      : null;
  const targetOptions = contextualTarget ? [contextualTarget, ...broadTargetOptions] : broadTargetOptions;
  const selectedTarget = targetOptions.find((option) => option.value === target) ?? targetOptions[0];
  const isBulk = target === "all_units" || target === "all_owners";
  const bulkCount = target === "all_units" ? units.length : target === "all_owners" ? owners.length : 1;
  const bulkTotal = Number(amount || 0) * bulkCount;

  function openDialog() {
    setTarget(defaultTarget);
    setSchedule("one_off");
    setAmount(defaultAmount);
    setOpen(true);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="icon"
          size="sm"
          className="rounded-full"
          aria-label="Add charge"
          title="Add charge"
          onClick={openDialog}
        >
          <CurrencyDollar size={18} weight="bold" aria-hidden="true" />
          <Plus className="-ml-1" size={11} weight="bold" aria-hidden="true" />
        </Button>
        {showDownload ? (
          <Button
            type="button"
            variant="icon"
            size="sm"
            className="rounded-full"
            aria-label="Download invoices"
            title="Download invoices"
            disabled
          >
            <DownloadSimple size={18} aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <Dialog
        open={open}
        title="Add a charge"
        className="m-auto w-full max-w-md rounded-2xl"
        contentClassName="!p-8 sm:!p-10"
        onOpenChange={setOpen}
      >
        {open ? <span aria-hidden="true" tabIndex={-1} autoFocus className="absolute h-px w-px overflow-hidden" /> : null}
        <form action={action} className="space-y-5">
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="charge_to" value={selectedTarget?.value.startsWith("unit:") ? "unit" : selectedTarget?.value.startsWith("owner:") ? "owner" : selectedTarget?.value ?? ""} />
          <input type="hidden" name="target_id" value={selectedTarget?.value.split(":")[1] ?? ""} />

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Charge to</span>
            <select
              name="target_display"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm text-zinc-950"
              aria-label="Charge to"
            >
              {targetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Description</span>
            <Input name="description" defaultValue={defaultDescription} placeholder="Bono empleados" required />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Amount</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-medium text-zinc-500">PEN</span>
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="pl-12"
                placeholder="22.00"
                required
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Schedule</span>
            <select
              name="schedule"
              value={schedule}
              onChange={(event) => setSchedule(event.target.value as "one_off" | "recurring")}
              className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm text-zinc-950"
            >
              <option value="one_off">One-off</option>
              <option value="recurring">Recurring</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Starts</span>
            <Input name="starts_month" type="month" defaultValue={workingMonth} required />
          </label>

          {schedule === "recurring" ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-700">Ends</span>
              <Input name="ends_month" type="month" min={workingMonth} />
            </label>
          ) : null}

          {isBulk ? (
            <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              <div>{bulkCount} {target === "all_units" ? "units" : "owners"} × PEN {formatAmount(Number(amount || 0))}</div>
              <div className="mt-1 font-medium text-zinc-950">Total: PEN {formatAmount(bulkTotal)}</div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton />
          </div>
        </form>
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
          aria-label="Close add charge dialog"
          onClick={() => setOpen(false)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </Dialog>
    </>
  );
}
