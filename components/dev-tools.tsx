"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useSyncExternalStore, useState, type ReactNode } from "react";

import { clearDevBusinessDateAction, setDevBusinessDateAction } from "@/server/business-date/actions";
import { resetDevTestSessionAction, startDevTestSessionAction } from "@/server/dev-test-session/actions";

const STORAGE_KEYS = {
  outline: "tb810-dev-outline",
  grid: "tb810-dev-grid",
  spacing: "tb810-dev-spacing",
  pageBreaks: "tb810-dev-page-breaks",
  historicalEditing: "tb810-dev-historical-editing",
};

type DevToolsSnapshot = {
  outline: boolean;
  historicalEditingEnabled: boolean;
  historicalEditingAvailable: boolean;
  businessDateActive: boolean;
  businessDateValue: string;
  testSessionActive: boolean;
  testSessionId: string;
  testSessionMutations: number;
};

type DevToolsStore = DevToolsSnapshot & {
  setOutline: (next: boolean | ((current: boolean) => boolean)) => void;
  setHistoricalEditingEnabled: (next: boolean | ((current: boolean) => boolean)) => void;
};

let snapshot: DevToolsSnapshot = {
  outline: false,
  historicalEditingEnabled: false,
  historicalEditingAvailable: false,
  businessDateActive: false,
  businessDateValue: "",
  testSessionActive: false,
  testSessionId: "",
  testSessionMutations: 0,
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
    applyBodyFlag("data-dev-historical-editing", snapshot.historicalEditingEnabled);
    if (snapshot.businessDateActive) {
      document.body.setAttribute("data-dev-business-date-active", "1");
      document.body.setAttribute("data-dev-business-date", snapshot.businessDateValue);
    } else {
      document.body.removeAttribute("data-dev-business-date-active");
      document.body.removeAttribute("data-dev-business-date");
    }
    if (snapshot.testSessionActive) {
      document.body.setAttribute("data-dev-test-session-active", "1");
      document.body.setAttribute("data-dev-test-session-id", snapshot.testSessionId);
      document.body.setAttribute("data-dev-test-session-mutations", String(snapshot.testSessionMutations));
    } else {
      document.body.removeAttribute("data-dev-test-session-active");
      document.body.removeAttribute("data-dev-test-session-id");
      document.body.removeAttribute("data-dev-test-session-mutations");
    }
  }
  writeStoredFlag(STORAGE_KEYS.outline, snapshot.outline);
  writeStoredFlag(STORAGE_KEYS.historicalEditing, snapshot.historicalEditingEnabled);
  notify();
}

function initializeStore() {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  const bodyOutline = document.body.dataset.devOutline === "1";
  const bodyHistoricalEditingAvailable =
    document.body.dataset.devHistoricalEditingAvailable === "1";
  const bodyBusinessDateActive = document.body.dataset.devBusinessDateActive === "1";
  const bodyBusinessDate = document.body.dataset.devBusinessDate ?? "";
  const bodyTestSessionActive = document.body.dataset.devTestSessionActive === "1";
  const bodyTestSessionId = document.body.dataset.devTestSessionId ?? "";
  const bodyTestSessionMutations = Number(document.body.dataset.devTestSessionMutations ?? "0");

  snapshot = {
    outline: readStoredFlag(STORAGE_KEYS.outline) || bodyOutline,
    historicalEditingEnabled:
      bodyHistoricalEditingAvailable && readStoredFlag(STORAGE_KEYS.historicalEditing),
    historicalEditingAvailable: bodyHistoricalEditingAvailable,
    businessDateActive: bodyBusinessDateActive,
    businessDateValue: bodyBusinessDate,
    testSessionActive: bodyTestSessionActive,
    testSessionId: bodyTestSessionId,
    testSessionMutations: Number.isFinite(bodyTestSessionMutations) ? bodyTestSessionMutations : 0,
  };

  applyBodyFlag("data-dev-outline", snapshot.outline);
  applyBodyFlag("data-dev-historical-editing", snapshot.historicalEditingEnabled);
  if (snapshot.businessDateActive) {
    document.body.setAttribute("data-dev-business-date-active", "1");
    document.body.setAttribute("data-dev-business-date", snapshot.businessDateValue);
  }
  if (snapshot.testSessionActive) {
    document.body.setAttribute("data-dev-test-session-active", "1");
    document.body.setAttribute("data-dev-test-session-id", snapshot.testSessionId);
    document.body.setAttribute("data-dev-test-session-mutations", String(snapshot.testSessionMutations));
  }
}

function readSnapshot() {
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
  const setHistoricalEditingEnabled = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved =
      typeof next === "function" ? next(snapshot.historicalEditingEnabled) : next;
    setSnapshot({ historicalEditingEnabled: resolved });
  };

  return {
    ...current,
    setOutline,
    setHistoricalEditingEnabled,
  } as DevToolsStore;
}

export function DevToolsToolbar() {
  const state = useDevTools();
  const pathname = usePathname();
  const showToolbar = process.env.NODE_ENV === "development";
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const items = useMemo(
    () => [
      ["Outline", state.outline, state.setOutline],
      ...(state.historicalEditingAvailable
        ? [["Edit", state.historicalEditingEnabled, state.setHistoricalEditingEnabled] as const]
        : []),
    ] as const,
    [state],
  );

  if (!showToolbar) return null;

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const rect = toolbar.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    const toolbar = toolbarRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !toolbar) return;

    const width = toolbar.offsetWidth;
    const height = toolbar.offsetHeight;
    const nextLeft = Math.max(12, Math.min(window.innerWidth - width - 12, dragState.startLeft + (event.clientX - dragState.startX)));
    const nextTop = Math.max(12, Math.min(window.innerHeight - height - 12, dragState.startTop + (event.clientY - dragState.startY)));
    setPosition({ left: nextLeft, top: nextTop });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  return (
    <>
      <div
        ref={toolbarRef}
        className="fixed z-[10000] w-72 rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-xl backdrop-blur"
        style={{ left: position.left, top: position.top }}
      >
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="mb-2 flex w-full cursor-grab items-center justify-between rounded-lg px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 active:cursor-grabbing"
          aria-label="Drag DEV toolbar"
          title="Drag to move"
        >
          <span>Dev only</span>
          <span className="text-[10px] font-normal text-white/50">Drag</span>
        </button>
        <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] text-white/80">
          <div className="flex items-center justify-between gap-2">
            <span>Business date</span>
            <span className="font-medium text-emerald-300">{state.businessDateValue}</span>
          </div>
          {state.businessDateActive ? (
            <form action={clearDevBusinessDateAction} className="mt-2">
              <input type="hidden" name="return_to" value={pathname} />
              <button
                type="submit"
                className="w-full rounded-md border border-white/15 px-2 py-1.5 text-white"
              >
                Reset to today
              </button>
            </form>
          ) : null}
          <form action={setDevBusinessDateAction} className="mt-2 space-y-2">
            <input type="hidden" name="return_to" value={pathname} />
            <label className="block space-y-1">
              <span className="text-[11px] text-white/70">Change business date</span>
              <input
                name="business_date"
                type="date"
                defaultValue={state.businessDateValue}
                className="h-9 w-full rounded-md border border-white/15 bg-black/40 px-2 text-white"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-md bg-white px-2 py-1.5 font-medium text-black"
            >
              Set date
            </button>
          </form>
        </div>
        <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] text-white/80">
          {state.testSessionActive ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span>Test session</span>
                <span className="font-medium text-emerald-300">Active</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-emerald-300">{state.testSessionMutations} mutations</span>
              </div>
              <form action={resetDevTestSessionAction} className="space-y-2">
                <input type="hidden" name="return_to" value={pathname} />
                <input type="hidden" name="session_id" value={state.testSessionId} />
                <button type="submit" className="w-full rounded-md border border-white/15 px-2 py-1.5 text-white">
                  Reset test session
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span>Test session</span>
                <span className="font-medium text-white/70">Not active</span>
              </div>
              <form action={startDevTestSessionAction}>
                <input type="hidden" name="return_to" value={pathname} />
                <button type="submit" className="w-full rounded-md border border-white/15 px-2 py-1.5 text-white">
                  Start test session
                </button>
              </form>
            </div>
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
      </div>
    </>
  );
}
