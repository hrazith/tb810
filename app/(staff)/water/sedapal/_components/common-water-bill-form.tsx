"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { CaretLeft, FilePdf } from "@phosphor-icons/react/dist/ssr";
import {
  formatMonthYear,
  getChargeMonthFromServiceMonth,
  getServiceMonthFromReadingDate,
} from "@/lib/water-dates";
import type { WaterBillFormState } from "@/server/water";

type Props = {
  action: (
    prevState: WaterBillFormState,
    formData: FormData,
  ) => Promise<WaterBillFormState>;
  submitLabel: string;
  previousReadingHelpText: string;
  previousReadingLabel: string;
  previousReadingReadOnly?: boolean;
  utilityBillId?: string;
  devTestContext?: boolean;
  initialValues?: Partial<{
    bill_date: string;
    previous_reading: string;
    current_reading: string;
    amount: string;
    description: string;
    notes: string;
  }>;
  showDescription?: boolean;
  showNotes?: boolean;
  compact?: boolean;
  hideCancel?: boolean;
  onCancel?: () => void;
  onSuccess?: () => void;
  showSummary?: boolean;
};

const initialState: WaterBillFormState = {};

function fieldError(field: string, state: WaterBillFormState) {
  return state.fieldErrors?.[
    field as keyof NonNullable<WaterBillFormState["fieldErrors"]>
  ];
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const MAX_SOURCE_PDF_BYTES = 10 * 1024 * 1024;

function isValidSourcePdf(file: File | null) {
  return Boolean(
    file &&
      file.type === "application/pdf" &&
      file.size > 0 &&
      file.size <= MAX_SOURCE_PDF_BYTES,
  );
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatReading(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { maximumFractionDigits: 3 })
    : value || "—";
}

export function CommonWaterBillForm({
  action,
  submitLabel,
  previousReadingHelpText,
  previousReadingLabel,
  previousReadingReadOnly = true,
  utilityBillId,
  devTestContext = false,
  initialValues,
  showDescription = true,
  showNotes = true,
  compact = false,
  hideCancel = false,
  onCancel,
  onSuccess,
  showSummary = true,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const lastSuccessRef = useRef<string | undefined>(undefined);
  const sourcePdfInputRef = useRef<HTMLInputElement | null>(null);
  const sourcePdfInputId = useId();
  const [step, setStep] = useState(utilityBillId ? 2 : 1);
  const [selectedSourcePdf, setSelectedSourcePdf] = useState<File | null>(null);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [billDate, setBillDate] = useState(
    state.values?.bill_date ?? initialValues?.bill_date ?? "",
  );
  const [previousReading, setPreviousReading] = useState(
    state.values?.previous_reading ?? initialValues?.previous_reading ?? "",
  );
  const [currentReading, setCurrentReading] = useState(
    state.values?.current_reading ?? initialValues?.current_reading ?? "",
  );
  const [amount, setAmount] = useState(
    state.values?.amount ?? initialValues?.amount ?? "",
  );
  const [description, setDescription] = useState(
    state.values?.description ?? initialValues?.description ?? "",
  );
  const [notes, setNotes] = useState(
    state.values?.notes ?? initialValues?.notes ?? "",
  );

  const totalConsumption = useMemo(() => {
    const prev = toNumber(previousReading);
    const curr = toNumber(currentReading);
    if (prev === null || curr === null) return null;
    const value = curr - prev;
    return value >= 0 ? value : null;
  }, [currentReading, previousReading]);

  const unitCost = useMemo(() => {
    const total = totalConsumption;
    const totalAmount = toNumber(amount);
    if (total === null || totalAmount === null || total === 0) return null;
    return totalAmount / total;
  }, [amount, totalConsumption]);

  const validSourcePdf = isValidSourcePdf(selectedSourcePdf);

  const serviceMonth = useMemo(() => {
    return formatMonthYear(getServiceMonthFromReadingDate(billDate));
  }, [billDate]);

  const chargeMonth = useMemo(() => {
    return formatMonthYear(
      getChargeMonthFromServiceMonth(getServiceMonthFromReadingDate(billDate)),
    );
  }, [billDate]);

  const summary = [
    { label: "Service Month", value: serviceMonth },
    { label: "Charge Month", value: chargeMonth },
    { label: "Total Consumption", value: totalConsumption },
    { label: "Unit Cost", value: unitCost },
  ];

  function continueToBillDetails() {
    if (!isValidSourcePdf(selectedSourcePdf)) return;
    setStep(2);
  }

  function displayedFieldError(field: string) {
    return touchedFields[field] || submitAttempted ? fieldError(field, state) : null;
  }

  useEffect(() => {
    if (!state.success || state.success === lastSuccessRef.current) return;
    lastSuccessRef.current = state.success;
    onSuccess?.();
  }, [onSuccess, state.success]);

  return (
    <form
      action={formAction}
      className="space-y-6"
      onSubmit={() => setSubmitAttempted(true)}
    >
      {utilityBillId ? (
        <input type="hidden" name="utility_bill_id" value={utilityBillId} />
      ) : null}
      {devTestContext ? <input type="hidden" name="dev_test_context" value="1" /> : null}
      <input type="hidden" name="previous_reading" value={previousReading} />
      {!utilityBillId
        ? step === 2
          ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label="Return to PDF upload"
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-sm text-zinc-500 transition hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              >
                <CaretLeft size={18} aria-hidden="true" />
                <span>Step 2 of 2</span>
              </button>
            )
          : (
              <p className="text-sm text-zinc-500">Step 1 of 2</p>
            )
        : null}

      <div className={!utilityBillId && step === 1 ? "space-y-6" : "hidden"}>
        <label className="block space-y-2">
          <span className="block text-lg font-medium text-zinc-900">
            Upload Sedapal invoice
          </span>
          <input
            ref={sourcePdfInputRef}
            id={sourcePdfInputId}
            name="source_pdf"
            type="file"
            accept="application/pdf,.pdf"
            required={!utilityBillId}
            className="sr-only"
            onChange={(event) =>
              setSelectedSourcePdf(event.target.files?.[0] ?? null)
            }
          />
          {validSourcePdf && selectedSourcePdf ? (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <FilePdf size={22} className="shrink-0 text-zinc-700" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {selectedSourcePdf.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {formatFileSize(selectedSourcePdf.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => sourcePdfInputRef.current?.click()}
                className="shrink-0 cursor-pointer text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-950"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <label
                htmlFor={sourcePdfInputId}
                className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
              >
                Choose PDF
              </label>
              <span className="text-sm text-zinc-500">PDF · up to 10 MB</span>
            </div>
          )}
          {selectedSourcePdf && !isValidSourcePdf(selectedSourcePdf) ? (
            <p className="text-sm text-red-600">
              Choose a PDF up to 10 MB.
            </p>
          ) : null}
          {displayedFieldError("source_pdf") ? (
            <p className="text-sm text-red-600">{displayedFieldError("source_pdf")}</p>
          ) : null}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={continueToBillDetails}
            disabled={!validSourcePdf}
            className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue
          </button>
          {hideCancel ? null : onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className={!utilityBillId && step === 1 ? "hidden" : "space-y-6"}>
        <div className="grid gap-4">
          <label className="space-y-2">
            <span className="block text-lg font-medium text-zinc-900">
              Reading date
            </span>
            <input
              name="bill_date"
              type="date"
              value={billDate}
              onChange={(event) => setBillDate(event.target.value)}
              onBlur={() =>
                setTouchedFields((fields) => ({ ...fields, bill_date: true }))
              }
              className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition selection:bg-zinc-200 selection:text-zinc-950 focus:border-zinc-950"
            />
            {displayedFieldError("bill_date") ? (
              <p className="text-sm text-red-600">
                {displayedFieldError("bill_date")}
              </p>
            ) : null}
          </label>

          <label className="space-y-2">
            <span className="block text-lg font-medium text-zinc-900">
              Invoice amount
            </span>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              onBlur={() =>
                setTouchedFields((fields) => ({ ...fields, amount: true }))
              }
              className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
            />
            {displayedFieldError("amount") ? (
              <p className="text-sm text-red-600">
                {displayedFieldError("amount")}
              </p>
            ) : null}
          </label>

          {utilityBillId ? (
            <label className="space-y-2">
              <span className="block text-lg font-medium text-zinc-900">
                {previousReadingLabel}
              </span>
              <input
                name="previous_reading"
                type="number"
                step="0.001"
                min="0"
                inputMode="decimal"
                value={previousReading}
                readOnly={previousReadingReadOnly}
                onChange={
                  previousReadingReadOnly
                    ? undefined
                    : (event) => setPreviousReading(event.target.value)
                }
                className="h-12 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-sm outline-none transition read-only:cursor-not-allowed focus:border-zinc-950"
              />
              <p className="text-xs text-zinc-500">{previousReadingHelpText}</p>
              {displayedFieldError("previous_reading") ? (
                <p className="text-sm text-red-600">
                  {displayedFieldError("previous_reading")}
                </p>
              ) : null}
            </label>
          ) : (
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-zinc-500">Previous reading</span>
              <span className="font-medium text-zinc-900">
                {formatReading(previousReading)}
              </span>
            </div>
          )}

          <label className="space-y-2">
            <span className="block text-lg font-medium text-zinc-900">
              Current reading
            </span>
            <input
              name="current_reading"
              type="number"
              step="0.001"
              min="0"
              inputMode="decimal"
              value={currentReading}
              onChange={(event) => setCurrentReading(event.target.value)}
              onBlur={() =>
                setTouchedFields((fields) => ({ ...fields, current_reading: true }))
              }
              className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
            />
            {displayedFieldError("current_reading") ? (
              <p className="text-sm text-red-600">
                {displayedFieldError("current_reading")}
              </p>
            ) : null}
          </label>
        </div>

        {showSummary ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {item.label}
                </p>
                <p className="mt-2 text-lg font-semibold text-zinc-950">
                  {item.value === null || item.value === ""
                    ? "—"
                    : item.label === "Unit Cost"
                      ? `${Number(item.value).toFixed(4)}`
                      : typeof item.value === "number"
                        ? item.value.toFixed(3).replace(/\.?0+$/, "")
                        : item.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {showDescription ? (
          <label className="block space-y-2">
            <span className="block text-lg font-medium text-zinc-900">
              Description
            </span>
            <input
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
              placeholder="Sedapal invoice reference"
            />
            {displayedFieldError("description") ? (
              <p className="text-sm text-red-600">
                {displayedFieldError("description")}
              </p>
            ) : null}
          </label>
        ) : null}

        {showNotes ? (
          <label className="block space-y-2">
            <span className="block text-lg font-medium text-zinc-900">
              Notes
            </span>
            <textarea
              name="notes"
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none transition focus:border-zinc-950"
            />
            {displayedFieldError("notes") ? (
              <p className="text-sm text-red-600">
                {displayedFieldError("notes")}
              </p>
            ) : null}
          </label>
        ) : null}

        {state.error && !state.fieldErrors ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? "Saving..." : submitLabel}
          </button>
          {hideCancel ? null : onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
