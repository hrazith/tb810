"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { clearDevBusinessDateAction, setDevBusinessDateAction } from "@/server/business-date/actions";

const STORAGE_KEYS = {
  outline: "tb810-dev-outline",
  grid: "tb810-dev-grid",
  spacing: "tb810-dev-spacing",
  pageBreaks: "tb810-dev-page-breaks",
  historicalEditing: "tb810-dev-historical-editing",
};

type DevToolsSnapshot = {
  outline: boolean;
  grid: boolean;
  spacing: boolean;
  pageBreaks: boolean;
  historicalEditingEnabled: boolean;
  historicalEditingAvailable: boolean;
  businessDateActive: boolean;
  businessDateValue: string;
};

type DevToolsStore = DevToolsSnapshot & {
  setOutline: (next: boolean | ((current: boolean) => boolean)) => void;
  setGrid: (next: boolean | ((current: boolean) => boolean)) => void;
  setSpacing: (next: boolean | ((current: boolean) => boolean)) => void;
  setPageBreaks: (next: boolean | ((current: boolean) => boolean)) => void;
  setHistoricalEditingEnabled: (next: boolean | ((current: boolean) => boolean)) => void;
};

let snapshot: DevToolsSnapshot = {
  outline: false,
  grid: false,
  spacing: false,
  pageBreaks: false,
  historicalEditingEnabled: false,
  historicalEditingAvailable: false,
  businessDateActive: false,
  businessDateValue: "",
};

const listeners = new Set<() => void>();
let initialized = false;

function readStoredFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeStoredFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Ignore storage errors.
  }
}

function applyBodyFlag(attr: string, value: boolean) {
  if (typeof document === "undefined") return;
  if (value) {
    document.body.setAttribute(attr, "1");
  } else {
    document.body.removeAttribute(attr);
  }
}

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(patch: Partial<DevToolsSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  if (typeof document !== "undefined") {
    applyBodyFlag("data-dev-outline", snapshot.outline);
    applyBodyFlag("data-dev-grid", snapshot.grid);
    applyBodyFlag("data-dev-spacing", snapshot.spacing);
    applyBodyFlag("data-dev-page-breaks", snapshot.pageBreaks);
    applyBodyFlag("data-dev-historical-editing", snapshot.historicalEditingEnabled);
    if (snapshot.businessDateActive) {
      document.body.setAttribute("data-dev-business-date-active", "1");
      document.body.setAttribute("data-dev-business-date", snapshot.businessDateValue);
    } else {
      document.body.removeAttribute("data-dev-business-date-active");
      document.body.removeAttribute("data-dev-business-date");
    }
  }
  writeStoredFlag(STORAGE_KEYS.outline, snapshot.outline);
  writeStoredFlag(STORAGE_KEYS.grid, snapshot.grid);
  writeStoredFlag(STORAGE_KEYS.spacing, snapshot.spacing);
  writeStoredFlag(STORAGE_KEYS.pageBreaks, snapshot.pageBreaks);
  writeStoredFlag(STORAGE_KEYS.historicalEditing, snapshot.historicalEditingEnabled);
  notify();
}

function initializeStore() {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  const bodyOutline = document.body.dataset.devOutline === "1";
  const bodyGrid = document.body.dataset.devGrid === "1";
  const bodySpacing = document.body.dataset.devSpacing === "1";
  const bodyPageBreaks = document.body.dataset.devPageBreaks === "1";
  const bodyHistoricalEditingAvailable =
    document.body.dataset.devHistoricalEditingAvailable === "1";
  const bodyBusinessDateActive = document.body.dataset.devBusinessDateActive === "1";
  const bodyBusinessDate = document.body.dataset.devBusinessDate ?? "";

  snapshot = {
    outline: readStoredFlag(STORAGE_KEYS.outline) || bodyOutline,
    grid: readStoredFlag(STORAGE_KEYS.grid) || bodyGrid,
    spacing: readStoredFlag(STORAGE_KEYS.spacing) || bodySpacing,
    pageBreaks: readStoredFlag(STORAGE_KEYS.pageBreaks) || bodyPageBreaks,
    historicalEditingEnabled:
      bodyHistoricalEditingAvailable && readStoredFlag(STORAGE_KEYS.historicalEditing),
    historicalEditingAvailable: bodyHistoricalEditingAvailable,
    businessDateActive: bodyBusinessDateActive,
    businessDateValue: bodyBusinessDate,
  };

  applyBodyFlag("data-dev-outline", snapshot.outline);
  applyBodyFlag("data-dev-grid", snapshot.grid);
  applyBodyFlag("data-dev-spacing", snapshot.spacing);
  applyBodyFlag("data-dev-page-breaks", snapshot.pageBreaks);
  applyBodyFlag("data-dev-historical-editing", snapshot.historicalEditingEnabled);
  if (snapshot.businessDateActive) {
    document.body.setAttribute("data-dev-business-date-active", "1");
    document.body.setAttribute("data-dev-business-date", snapshot.businessDateValue);
  }
}

function readSnapshot() {
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function formatSpacingValue(value: string) {
  return value === "0px" ? "0" : value;
}

export function DevToolsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initializeStore();
  }, []);

  return <>{children}</>;
}

export function useDevTools() {
  const current = useSyncExternalStore(subscribe, readSnapshot, readSnapshot);

  const setOutline = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(snapshot.outline) : next;
    setSnapshot({ outline: resolved });
  };
  const setGrid = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(snapshot.grid) : next;
    setSnapshot({ grid: resolved });
  };
  const setSpacing = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(snapshot.spacing) : next;
    setSnapshot({ spacing: resolved });
  };
  const setPageBreaks = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(snapshot.pageBreaks) : next;
    setSnapshot({ pageBreaks: resolved });
  };
  const setHistoricalEditingEnabled = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved =
      typeof next === "function" ? next(snapshot.historicalEditingEnabled) : next;
    setSnapshot({ historicalEditingEnabled: resolved });
  };

  return {
    ...current,
    setOutline,
    setGrid,
    setSpacing,
    setPageBreaks,
    setHistoricalEditingEnabled,
  } as DevToolsStore;
}

export function DevToolsToolbar() {
  const state = useDevTools();
  const pathname = usePathname();
  const showToolbar = process.env.NODE_ENV === "development";

  const items = useMemo(
    () => [
      ["Outline", state.outline, state.setOutline],
      ["Grid", state.grid, state.setGrid],
      ["Spacing", state.spacing, state.setSpacing],
      ["Page breaks", state.pageBreaks, state.setPageBreaks],
      ...(state.historicalEditingAvailable
        ? [["Edit", state.historicalEditingEnabled, state.setHistoricalEditingEnabled] as const]
        : []),
    ] as const,
    [state],
  );

  useEffect(() => {
    if (!state.spacing) return;

    function onMouseMove(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const style = window.getComputedStyle(target);
      const padding = [
        style.paddingTop,
        style.paddingRight,
        style.paddingBottom,
        style.paddingLeft,
      ].map(formatSpacingValue);
      const margin = [
        style.marginTop,
        style.marginRight,
        style.marginBottom,
        style.marginLeft,
      ].map(formatSpacingValue);
      const tooltip = document.querySelector<HTMLElement>("[data-dev-spacing-tooltip]");
      if (!tooltip) return;
      tooltip.textContent = `p ${padding.join(" ")} | m ${margin.join(" ")}`;
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
    }

    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [state.spacing]);

  if (!showToolbar) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[10000] w-64 rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-xl backdrop-blur">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/80">
          Dev only
        </div>
        <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] text-white/80">
          {state.businessDateActive ? (
            <div className="flex items-center justify-between gap-2">
              <span>Business date override</span>
              <span className="font-medium text-emerald-300">{state.businessDateValue}</span>
            </div>
          ) : (
            <span>No business date override</span>
          )}
        </div>
        {items.map(([label, checked, setChecked]) => (
          <label
            key={label}
            className="mt-2 flex cursor-pointer items-center justify-between gap-2 first:mt-0"
          >
            <span className="text-white/90">{label}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-red-500"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
          </label>
        ))}
        <form action={setDevBusinessDateAction} className="mt-3 space-y-2">
          <input type="hidden" name="return_to" value={pathname} />
          <label className="block space-y-1">
            <span className="text-[11px] text-white/70">Business date</span>
            <input
              name="business_date"
              type="date"
              defaultValue={state.businessDateValue}
              className="h-9 w-full rounded-md border border-white/15 bg-black/40 px-2 text-white"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-md bg-white px-2 py-1.5 font-medium text-black"
            >
              Set
            </button>
            <button
              formAction={clearDevBusinessDateAction}
              type="submit"
              className="rounded-md border border-white/15 px-2 py-1.5 text-white"
            >
              Clear
            </button>
          </div>
        </form>
      </div>
      <div
        data-dev-spacing-tooltip
        className="pointer-events-none fixed z-[10000] rounded-md bg-black/80 px-2 py-1 text-[10px] text-white opacity-0"
      />
    </>
  );
}
