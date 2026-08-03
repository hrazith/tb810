"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEYS = {
  outline: "tb810-dev-outline",
  grid: "tb810-dev-grid",
  spacing: "tb810-dev-spacing",
  pageBreaks: "tb810-dev-page-breaks",
  historicalEditing: "tb810-dev-historical-editing",
};

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

function formatSpacingValue(value: string) {
  return value === "0px" ? "0" : value;
}

export function useDevTools() {
  const [outline, setOutline] = useState(false);
  const [grid, setGrid] = useState(false);
  const [spacing, setSpacing] = useState(false);
  const [pageBreaks, setPageBreaks] = useState(false);
  const [historicalEditingEnabled, setHistoricalEditingEnabled] = useState(false);
  const [historicalEditingAvailable, setHistoricalEditingAvailable] = useState(false);

  useEffect(() => {
    const bodyOutline = document.body.dataset.devOutline === "1";
    const bodyGrid = document.body.dataset.devGrid === "1";
    const bodySpacing = document.body.dataset.devSpacing === "1";
    const bodyPageBreaks = document.body.dataset.devPageBreaks === "1";
    const bodyHistoricalEditingAvailable = document.body.dataset.devHistoricalEditingAvailable === "1";

    const initialOutline = readStoredFlag(STORAGE_KEYS.outline) || bodyOutline;
    const initialGrid = readStoredFlag(STORAGE_KEYS.grid) || bodyGrid;
    const initialSpacing = readStoredFlag(STORAGE_KEYS.spacing) || bodySpacing;
    const initialPageBreaks = readStoredFlag(STORAGE_KEYS.pageBreaks) || bodyPageBreaks;
    const initialHistoricalEditing =
      bodyHistoricalEditingAvailable && readStoredFlag(STORAGE_KEYS.historicalEditing);

    setOutline(initialOutline);
    setGrid(initialGrid);
    setSpacing(initialSpacing);
    setPageBreaks(initialPageBreaks);
    setHistoricalEditingEnabled(initialHistoricalEditing);
    setHistoricalEditingAvailable(bodyHistoricalEditingAvailable);

    applyBodyFlag("data-dev-outline", initialOutline);
    applyBodyFlag("data-dev-grid", initialGrid);
    applyBodyFlag("data-dev-spacing", initialSpacing);
    applyBodyFlag("data-dev-page-breaks", initialPageBreaks);
    applyBodyFlag("data-dev-historical-editing", initialHistoricalEditing);
  }, []);

  useEffect(() => {
    applyBodyFlag("data-dev-outline", outline);
    writeStoredFlag(STORAGE_KEYS.outline, outline);
  }, [outline]);

  useEffect(() => {
    applyBodyFlag("data-dev-grid", grid);
    writeStoredFlag(STORAGE_KEYS.grid, grid);
  }, [grid]);

  useEffect(() => {
    applyBodyFlag("data-dev-spacing", spacing);
    writeStoredFlag(STORAGE_KEYS.spacing, spacing);
  }, [spacing]);

  useEffect(() => {
    applyBodyFlag("data-dev-page-breaks", pageBreaks);
    writeStoredFlag(STORAGE_KEYS.pageBreaks, pageBreaks);
  }, [pageBreaks]);

  useEffect(() => {
    applyBodyFlag("data-dev-historical-editing", historicalEditingEnabled);
    writeStoredFlag(STORAGE_KEYS.historicalEditing, historicalEditingEnabled);
  }, [historicalEditingEnabled]);

  useEffect(() => {
    if (!spacing) return;

    function onMouseMove(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const style = window.getComputedStyle(target);
      const padding = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(formatSpacingValue);
      const margin = [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].map(formatSpacingValue);
      const tooltip = document.querySelector<HTMLElement>("[data-dev-spacing-tooltip]");
      if (!tooltip) return;
      tooltip.textContent = `p ${padding.join(" ")} | m ${margin.join(" ")}`;
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
    }

    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [spacing]);

  return {
    outline,
    grid,
    spacing,
    pageBreaks,
    historicalEditingEnabled,
    historicalEditingAvailable,
    setOutline,
    setGrid,
    setSpacing,
    setPageBreaks,
    setHistoricalEditingEnabled,
  };
}

export function DevToolsToolbar() {
  const state = useDevTools();
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

  if (!showToolbar) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[10000] w-44 rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-xl backdrop-blur">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/80">Dev only</div>
        {items.map(([label, checked, setChecked]) => (
          <label key={label} className="mt-2 flex cursor-pointer items-center justify-between gap-2 first:mt-0">
            <span className="text-white/90">{label}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-red-500"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
          </label>
        ))}
      </div>
      <div
        data-dev-spacing-tooltip
        className="pointer-events-none fixed z-[10000] rounded-md bg-black/80 px-2 py-1 text-[10px] text-white opacity-0"
      />
    </>
  );
}
