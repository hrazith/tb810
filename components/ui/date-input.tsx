"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

import {
  addCalendarDays,
  daysInMonth,
  formatCalendarDate,
  maskDisplayDate,
  parseCanonicalDate,
  parseDisplayDate,
  toCanonicalDate,
  todayCanonicalDate,
  weekdayIndex,
} from "@/lib/calendar-date";
import { inputFieldClassName } from "@/components/ui/input";

// TB810 date field: operators read and type DD/MM/YYYY, forms submit the
// canonical YYYY-MM-DD under `name`. Text and calendar wording come from
// `locale` and `labels`, so a future Spanish UI changes neither the numeric
// order nor the submitted value.

export type DateInputLabels = {
  openCalendar: string;
  previousMonth: string;
  nextMonth: string;
  invalidDate: string;
  beforeMin: (minDisplay: string) => string;
  afterMax: (maxDisplay: string) => string;
};

export const defaultDateInputLabels: DateInputLabels = {
  openCalendar: "Choose date",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  invalidDate: "Enter a valid date as dd/mm/yyyy.",
  beforeMin: (minDisplay) => `Enter a date on or after ${minDisplay}.`,
  afterMax: (maxDisplay) => `Enter a date on or before ${maxDisplay}.`,
};

type DateInputProps = {
  id?: string;
  /** Submitted (hidden) field name; always carries YYYY-MM-DD or "". */
  name?: string;
  form?: string;
  /** Controlled canonical value, YYYY-MM-DD or "". */
  value?: string;
  defaultValue?: string;
  /** Receives the canonical value: YYYY-MM-DD, or "" while the text is empty or invalid. */
  onValueChange?: (value: string) => void;
  /** Fires when focus leaves the whole field (text box and calendar). */
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  appearance?: "filled" | "outlined";
  className?: string;
  locale?: string;
  labels?: Partial<DateInputLabels>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

const OUTLINED_FIELD_CLASS =
  "block h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm text-zinc-950 placeholder:text-zinc-400 outline-none transition focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 read-only:cursor-not-allowed read-only:bg-zinc-50 aria-invalid:border-red-500";

const CALENDAR_WIDTH = 288;
const CALENDAR_HEIGHT = 336;

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

/** Pure: what the visible text means. Invalid or out-of-range text never yields a value. */
export function evaluateDateText(
  text: string,
  { min, max, labels = defaultDateInputLabels }: { min?: string; max?: string; labels?: DateInputLabels } = {},
) {
  if (text.trim() === "") return { value: "", message: "" };
  const value = parseDisplayDate(text);
  if (!value) return { value: "", message: labels.invalidDate };
  if (min && parseCanonicalDate(min) && value < min) {
    return { value: "", message: labels.beforeMin(formatCalendarDate(min) ?? min) };
  }
  if (max && parseCanonicalDate(max) && value > max) {
    return { value: "", message: labels.afterMax(formatCalendarDate(max) ?? max) };
  }
  return { value, message: "" };
}

/** Pure: Monday-first weeks for a month, with null padding outside the month. */
export function buildCalendarMonth(year: number, month: number) {
  const first = toCanonicalDate({ year, month, day: 1 });
  const cells: Array<string | null> = Array.from({ length: weekdayIndex(first) ?? 0 }, () => null);
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    cells.push(toCanonicalDate({ year, month, day }));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

function clampDate(value: string, min?: string, max?: string) {
  if (min && parseCanonicalDate(min) && value < min) return min;
  if (max && parseCanonicalDate(max) && value > max) return max;
  return value;
}

function utcDate(value: string) {
  const parts = parseCanonicalDate(value);
  return parts ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day)) : null;
}

export function DateInput({
  id,
  name,
  form,
  value,
  defaultValue,
  onValueChange,
  onBlur,
  onKeyDown,
  required,
  disabled,
  readOnly,
  min,
  max,
  placeholder = "dd/mm/yyyy",
  appearance = "filled",
  className,
  locale = "en-GB",
  labels: labelOverrides,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: DateInputProps) {
  const labels = { ...defaultDateInputLabels, ...labelOverrides };
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const messageId = `${generatedId}-message`;
  const calendarId = `${generatedId}-calendar`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  // Move focus into the grid on open and keyboard navigation, not on month-button clicks.
  const focusDayRef = useRef(false);

  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const canonical = value !== undefined ? value : internalValue;
  const [text, setText] = useState(() => formatCalendarDate(canonical) ?? "");
  const [syncedValue, setSyncedValue] = useState(canonical);

  // Follow external value changes (e.g. a form reset) without discarding text
  // the operator is still typing, which reports "" until it is a valid date.
  if (syncedValue !== canonical) {
    setSyncedValue(canonical);
    if (canonical !== evaluateDateText(text, { min, max, labels }).value) {
      setText(formatCalendarDate(canonical) ?? "");
    }
  }

  const evaluation = evaluateDateText(text, { min, max, labels });
  const validationMessage = disabled || readOnly ? "" : evaluation.message;

  const [open, setOpen] = useState(false);
  const [focusedDate, setFocusedDate] = useState("");
  const [view, setView] = useState({ year: 2000, month: 1 });
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    inputRef.current?.setCustomValidity(validationMessage);
  }, [validationMessage]);

  useEffect(() => {
    if (open && focusedDate && focusDayRef.current) dayRefs.current.get(focusedDate)?.focus();
  }, [open, focusedDate, view]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onViewportChange() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  function commitText(nextText: string) {
    setText(nextText);
    const nextValue = evaluateDateText(nextText, { min, max, labels }).value;
    if (nextValue !== canonical) {
      if (value === undefined) setInternalValue(nextValue);
      onValueChange?.(nextValue);
    }
  }

  function showMonthOf(date: string) {
    const parts = parseCanonicalDate(date);
    if (parts) setView({ year: parts.year, month: parts.month });
  }

  function openCalendar() {
    if (disabled || readOnly) return;
    const anchor = clampDate(evaluation.value || canonical || todayCanonicalDate(), min, max);
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.max(8, Math.min(rect.right - CALENDAR_WIDTH, window.innerWidth - CALENDAR_WIDTH - 8));
      const below = rect.bottom + 8;
      const top = below + CALENDAR_HEIGHT > window.innerHeight && rect.top - CALENDAR_HEIGHT - 8 > 0
        ? rect.top - CALENDAR_HEIGHT - 8
        : below;
      setPosition({ top, left });
    }
    focusDayRef.current = true;
    setFocusedDate(anchor);
    showMonthOf(anchor);
    setOpen(true);
  }

  function closeCalendar(returnFocusTo: "input" | "trigger") {
    setOpen(false);
    (returnFocusTo === "input" ? inputRef.current : triggerRef.current)?.focus();
  }

  function selectDate(date: string) {
    commitText(formatCalendarDate(date) ?? "");
    closeCalendar("input");
  }

  function moveFocus(date: string | null) {
    if (!date) return;
    const next = clampDate(date, min, max);
    focusDayRef.current = true;
    setFocusedDate(next);
    showMonthOf(next);
  }

  function shiftMonth(delta: number) {
    const target = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
    const year = target.getUTCFullYear();
    const month = target.getUTCMonth() + 1;
    const focusedDay = parseCanonicalDate(focusedDate)?.day ?? 1;
    setView({ year, month });
    setFocusedDate(clampDate(toCanonicalDate({ year, month, day: Math.min(focusedDay, daysInMonth(year, month)) }), min, max));
  }

  function handleDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const weekday = weekdayIndex(date) ?? 0;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(addCalendarDays(date, -1)),
      ArrowRight: () => moveFocus(addCalendarDays(date, 1)),
      ArrowUp: () => moveFocus(addCalendarDays(date, -7)),
      ArrowDown: () => moveFocus(addCalendarDays(date, 7)),
      Home: () => moveFocus(addCalendarDays(date, -weekday)),
      End: () => moveFocus(addCalendarDays(date, 6 - weekday)),
      PageUp: () => {
        focusDayRef.current = true;
        shiftMonth(-1);
      },
      PageDown: () => {
        focusDayRef.current = true;
        shiftMonth(1);
      },
      Escape: () => closeCalendar("trigger"),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
  }

  function handleRootBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    setOpen(false);
    onBlur?.();
  }

  const describedBy = [ariaDescribedBy, validationMessage ? messageId : undefined].filter(Boolean).join(" ") || undefined;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(view.year, view.month - 1, 1)));
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const weekdayLongFormatter = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  const dayLabelFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });
  // 2024-01-01 was a Monday; used only to name the weekday columns.
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2024, 0, 1 + index)));
  const selectedValue = evaluation.value;

  return (
    <div ref={rootRef} className="relative" onBlur={handleRootBlur}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        form={form}
        value={text}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid ?? (validationMessage ? true : undefined)}
        onChange={(event) => commitText(maskDisplayDate(event.target.value))}
        onKeyDown={(event) => {
          if (event.altKey && event.key === "ArrowDown") {
            event.preventDefault();
            openCalendar();
            return;
          }
          onKeyDown?.(event);
        }}
        className={joinClasses(
          appearance === "outlined" ? OUTLINED_FIELD_CLASS : inputFieldClassName,
          "pr-12 tabular-nums",
          className,
        )}
      />
      {name ? <input type="hidden" name={name} form={form} value={selectedValue} disabled={disabled} /> : null}
      {validationMessage ? <span id={messageId} className="sr-only">{validationMessage}</span> : null}
      <button
        ref={triggerRef}
        type="button"
        aria-label={labels.openCalendar}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={calendarId}
        disabled={disabled || readOnly}
        onClick={() => (open ? closeCalendar("trigger") : openCalendar())}
        className="absolute inset-y-0 right-1 my-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition-colors hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarBlank size={20} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={calendarId}
          role="dialog"
          aria-label={monthLabel}
          className="fixed z-50 w-72 rounded-lg border border-zinc-200 bg-white p-3 text-zinc-950 shadow-xl"
          style={{ top: position.top, left: position.left }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={labels.previousMonth}
              onClick={() => {
                focusDayRef.current = false;
                shiftMonth(-1);
              }}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            >
              <CaretLeft size={18} aria-hidden="true" />
            </button>
            <p className="text-sm font-medium capitalize" aria-live="polite">{monthLabel}</p>
            <button
              type="button"
              aria-label={labels.nextMonth}
              onClick={() => {
                focusDayRef.current = false;
                shiftMonth(1);
              }}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            >
              <CaretRight size={18} aria-hidden="true" />
            </button>
          </div>
          <table role="grid" aria-label={monthLabel} className="w-full table-fixed border-collapse text-center text-sm">
            <thead>
              <tr>
                {weekdays.map((weekday) => (
                  <th key={weekday.toISOString()} scope="col" abbr={weekdayLongFormatter.format(weekday)} className="pb-1 text-xs font-medium text-zinc-500">
                    {weekdayFormatter.format(weekday)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buildCalendarMonth(view.year, view.month).map((week, weekIndex) => (
                <tr key={weekIndex}>
                  {week.map((date, dayIndex) => {
                    if (!date) return <td key={`blank-${dayIndex}`} />;
                    const unavailable = Boolean((min && date < min) || (max && date > max));
                    const selected = date === selectedValue;
                    return (
                      <td key={date} role="gridcell" aria-selected={selected}>
                        <button
                          ref={(node) => {
                            if (node) dayRefs.current.set(date, node);
                            else dayRefs.current.delete(date);
                          }}
                          type="button"
                          tabIndex={date === focusedDate ? 0 : -1}
                          disabled={unavailable}
                          aria-label={dayLabelFormatter.format(utcDate(date) ?? undefined)}
                          aria-pressed={selected}
                          onClick={() => selectDate(date)}
                          onKeyDown={(event) => handleDayKeyDown(event, date)}
                          className={joinClasses(
                            "mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-md tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:text-zinc-300",
                            selected ? "bg-zinc-950 text-white" : "text-zinc-800 hover:bg-zinc-100",
                          )}
                        >
                          {parseCanonicalDate(date)?.day}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
