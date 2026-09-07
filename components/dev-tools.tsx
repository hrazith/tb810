"use client";

import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react";

import { clearDevBusinessDateAction, setDevBusinessDateAction } from "@/server/business-date/actions";
import type { GulianaDashboardFacts } from "@/server/dashboard";
import { completeGasReadingsAction } from "@/server/gas/actions";
import { addCommonWaterBillAction, completeWaterReadingsAction } from "@/server/water/actions";
import { addGasSupplierBillAction } from "@/server/gas/actions";
import { resetDevTestSessionAction, startDevTestSessionAction } from "@/server/dev-test-session/actions";
import { addUnitChargeAction } from "@/server/charges/actions";

const STORAGE_KEYS = {
  outline: "tb810-dev-outline",
  grid: "tb810-dev-grid",
  spacing: "tb810-dev-spacing",
  pageBreaks: "tb810-dev-page-breaks",
  historicalEditing: "tb810-dev-historical-editing",
};

const ACTIVE_TAB_STORAGE_KEY = "tb810-dev-active-tab";

type DevToolsSnapshot = {
  outline: boolean;
  historicalEditingEnabled: boolean;
  historicalEditingAvailable: boolean;
  businessDateActive: boolean;
  businessDateValue: string;
  testSessionActive: boolean;
  testSessionId: string;
  testSessionMutations: number;
  activeTab: "time" | "data" | "style";
};

type DevToolsStore = DevToolsSnapshot & {
  setOutline: (next: boolean | ((current: boolean) => boolean)) => void;
  setHistoricalEditingEnabled: (next: boolean | ((current: boolean) => boolean)) => void;
  setActiveTab: (next: "time" | "data" | "style") => void;
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
  activeTab: "time",
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

function readStoredActiveTab() {
  try {
    const value = sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    return value === "time" || value === "data" || value === "style" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredActiveTab(value: "time" | "data" | "style") {
  try {
    sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, value);
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
  writeStoredActiveTab(snapshot.activeTab);
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
  const bodyActiveTab = readStoredActiveTab() ?? "time";

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
    activeTab: bodyActiveTab,
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
  notify();
}

function readSnapshot() {
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isCanonicalDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function formatCanonicalDateKey(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatMonthYearKey(value: string) {
  const parsed = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatCurrencyPen(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return `PEN ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount)}`;
}

function readBodySnapshot() {
  if (typeof document === "undefined") return null;

  const bodyOutline = document.body.dataset.devOutline === "1";
  const bodyHistoricalEditingAvailable =
    document.body.dataset.devHistoricalEditingAvailable === "1";
  const bodyBusinessDateActive = document.body.dataset.devBusinessDateActive === "1";
  const bodyBusinessDate = document.body.dataset.devBusinessDate ?? "";
  const bodyTestSessionActive = document.body.dataset.devTestSessionActive === "1";
  const bodyTestSessionId = document.body.dataset.devTestSessionId ?? "";
  const bodyTestSessionMutations = Number(document.body.dataset.devTestSessionMutations ?? "0");
  const bodyActiveTab = readStoredActiveTab() ?? snapshot.activeTab;

  return {
    outline: readStoredFlag(STORAGE_KEYS.outline) || bodyOutline,
    historicalEditingEnabled:
      bodyHistoricalEditingAvailable && readStoredFlag(STORAGE_KEYS.historicalEditing),
    historicalEditingAvailable: bodyHistoricalEditingAvailable,
    businessDateActive: bodyBusinessDateActive,
    businessDateValue: bodyBusinessDate,
    testSessionActive: bodyTestSessionActive,
    testSessionId: bodyTestSessionId,
    testSessionMutations: Number.isFinite(bodyTestSessionMutations) ? bodyTestSessionMutations : 0,
    activeTab: bodyActiveTab,
  } satisfies DevToolsSnapshot;
}

function syncStoreFromDocument() {
  const next = readBodySnapshot();
  if (!next) return;

  const changed =
    snapshot.outline !== next.outline ||
    snapshot.historicalEditingEnabled !== next.historicalEditingEnabled ||
    snapshot.historicalEditingAvailable !== next.historicalEditingAvailable ||
    snapshot.businessDateActive !== next.businessDateActive ||
    snapshot.businessDateValue !== next.businessDateValue ||
    snapshot.testSessionActive !== next.testSessionActive ||
    snapshot.testSessionId !== next.testSessionId ||
    snapshot.testSessionMutations !== next.testSessionMutations;

  if (!changed) return;

  snapshot = next;
  notify();
}

export function DevToolsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initializeStore();
    syncStoreFromDocument();
  });

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
  const setActiveTab = (next: "time" | "data" | "style") => {
    setSnapshot({ activeTab: next });
  };

  return {
    ...current,
    setOutline,
    setHistoricalEditingEnabled,
    setActiveTab,
  } as DevToolsStore;
}

export function DevToolsToolbar({ dashboardFacts }: { dashboardFacts?: GulianaDashboardFacts | null }) {
  return <DevToolsToolbarInner dashboardFacts={dashboardFacts} />;
}

function DevToolsToolbarInner({ dashboardFacts }: { dashboardFacts?: GulianaDashboardFacts | null }) {
  const state = useDevTools();
  const pathname = usePathname();
  const showToolbar = process.env.NODE_ENV === "development";
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const dateFormRef = useRef<HTMLFormElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const businessDateKey = isCanonicalDateKey(state.businessDateValue) ? state.businessDateValue : "";
  const businessDateLabel = businessDateKey ? formatCanonicalDateKey(businessDateKey) : null;
  const dataMonthLabel = dashboardFacts ? formatMonthYearKey(dashboardFacts.operatingMonth) : null;
  const waterReadiness = dashboardFacts?.sourceWork.water.readingsReady ?? false;

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

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
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

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    const toolbar = toolbarRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !toolbar) return;

    const width = toolbar.offsetWidth;
    const height = toolbar.offsetHeight;
    const nextLeft = Math.max(12, Math.min(window.innerWidth - width - 12, dragState.startLeft + (event.clientX - dragState.startX)));
    const nextTop = Math.max(12, Math.min(window.innerHeight - height - 12, dragState.startTop + (event.clientY - dragState.startY)));
    setPosition({ left: nextLeft, top: nextTop });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  const openBusinessDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  };

  return (
    <>
      <div
        ref={toolbarRef}
        className="fixed z-[10000] w-[24rem] max-w-[calc(100vw-24px)] rounded-xl border border-white/10 bg-black/75 p-3 text-xs text-white shadow-xl backdrop-blur"
        style={{ left: position.left, top: position.top }}
      >
        <div
          className="flex items-center justify-between gap-3"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="presentation"
        >
          <button
            type="button"
            className="flex cursor-grab items-center gap-2 rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80"
            aria-label="Drag DEV toolbar"
            title="Drag to move"
          >
            <span>Dev only</span>
          </button>
          <span className="text-[10px] font-normal uppercase tracking-[0.18em] text-white/45">Drag</span>
        </div>

        <div className="mt-2 flex items-center gap-4 border-b border-white/10 text-[11px]">
          {(["time", "data", "style"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => state.setActiveTab(tab)}
              className={
                state.activeTab === tab
                  ? "border-b-2 border-white pb-2 font-semibold text-white"
                  : "pb-2 text-white/55 hover:text-white/80"
              }
            >
              {tab === "time" ? "Time" : tab === "data" ? "Data" : "Style"}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {state.activeTab === "time" ? (
            <div className="space-y-3">
              <form ref={dateFormRef} action={setDevBusinessDateAction} className="space-y-2">
                <input type="hidden" name="return_to" value={pathname} />
                <input
                  ref={dateInputRef}
                  name="business_date"
                  type="date"
                  defaultValue={businessDateKey}
                  className="sr-only"
                  aria-label="Business date"
                  onChange={(event) => {
                    if (event.currentTarget.value) {
                      dateFormRef.current?.requestSubmit();
                    }
                  }}
                />
                <button type="button" onClick={openBusinessDatePicker} className="flex items-start gap-2 text-left">
                  <span className={state.businessDateActive ? "text-red-300" : "text-emerald-300"}>📅</span>
                  {businessDateLabel ? (
                    <span className={state.businessDateActive ? "block text-base font-medium text-red-300" : "block text-base font-medium text-emerald-300"}>
                      {businessDateLabel}
                    </span>
                  ) : (
                    <span className="block text-base font-medium text-white/40">Loading date…</span>
                  )}
                </button>
                {state.businessDateActive ? (
                  <button
                    type="submit"
                    formAction={clearDevBusinessDateAction}
                    className="text-[11px] text-white/65 underline decoration-white/25 underline-offset-2 hover:text-white"
                  >
                    Reset to today
                  </button>
                ) : null}
              </form>
            </div>
          ) : null}

          {state.activeTab === "data" ? (
            <div className="space-y-4 text-[11px] text-white/80">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  TEST DATA · {dataMonthLabel ? dataMonthLabel.toUpperCase() : "—"}
                </p>

                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-white/90">Water</p>
                  <div className="space-y-1">
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span>Sedapal bill</span>
                        <span className="text-white/90">
                          {dashboardFacts?.sourceWork.water.commonWaterBillPresent ? "Present" : "Missing"}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        {state.testSessionActive && waterReadiness ? (
                          <form action={addCommonWaterBillAction}>
                            <input type="hidden" name="return_to" value={pathname} />
                            <button
                              type="submit"
                              className="text-white/65 underline decoration-white/25 underline-offset-2 hover:text-white"
                            >
                              + Add test bill
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="cursor-not-allowed text-white/35 underline decoration-white/15 underline-offset-2"
                          >
                            + Add test bill
                          </button>
                        )}
                        {!waterReadiness ? <span className="mt-1 block text-white/45">Complete Water readings first</span> : null}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span>Meter readings</span>
                        <span className="text-white/90">
                          {dashboardFacts
                            ? `${dashboardFacts.sourceWork.water.meterReadingCount} / ${dashboardFacts.sourceWork.water.meterReadingExpectedCount}`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        {dashboardFacts ? (
                          dashboardFacts.sourceWork.water.meterReadingCount < dashboardFacts.sourceWork.water.meterReadingExpectedCount ? (
                            state.testSessionActive ? (
                              <form action={completeWaterReadingsAction}>
                                <input type="hidden" name="return_to" value={pathname} />
                                <button
                                  type="submit"
                                  className="text-white/65 underline decoration-white/25 underline-offset-2 hover:text-white"
                                >
                                  + Complete
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="cursor-not-allowed text-white/35 underline decoration-white/15 underline-offset-2"
                              >
                                + Complete
                              </button>
                            )
                          ) : (
                            <span className="text-white/45">Complete</span>
                          )
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-white/90">Gas</p>
                  <div className="space-y-1">
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span>Supplier bills</span>
                        <span className="text-white/90">
                          {dashboardFacts
                            ? `${dashboardFacts.upcoming.gas.supplierBillCount} · ${formatCurrencyPen(dashboardFacts.upcoming.gas.supplierBillTotal)}`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        {state.testSessionActive ? (
                          <form action={addGasSupplierBillAction}>
                            <input type="hidden" name="return_to" value={pathname} />
                            <button
                              type="submit"
                              className="text-white/65 underline decoration-white/25 underline-offset-2 hover:text-white"
                            >
                              + Add test bill
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="cursor-not-allowed text-white/35 underline decoration-white/15 underline-offset-2"
                          >
                            + Add test bill
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span>Meter readings</span>
                        <span className="text-white/90">
                          {dashboardFacts
                            ? `${dashboardFacts.sourceWork.gas.gasReadingCount} / ${dashboardFacts.sourceWork.gas.gasUnitCount}`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        {dashboardFacts && dashboardFacts.sourceWork.gas.gasReadingCount < dashboardFacts.sourceWork.gas.gasUnitCount ? (
                          state.testSessionActive ? (
                            <form action={completeGasReadingsAction}>
                              <input type="hidden" name="return_to" value={pathname} />
                              <button
                                type="submit"
                                className="text-white/65 underline decoration-white/25 underline-offset-2 hover:text-white"
                              >
                                + Complete
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="cursor-not-allowed text-white/35 underline decoration-white/15 underline-offset-2"
                            >
                              + Complete
                            </button>
                          )
                        ) : (
                          <span className="text-white/45">Complete</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-white/90">September</p>
                  <div className="flex items-baseline justify-between gap-3">
                    <span>Unit charges</span>
                    <span className="text-white/90">
                      {dashboardFacts ? dashboardFacts.upcoming.charges.unitChargeCount : "—"}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    {state.testSessionActive ? (
                      <form action={addUnitChargeAction}>
                        <input type="hidden" name="return_to" value={pathname} />
                        <button
                          type="submit"
                          className="text-white/65 underline decoration-white/25 underline-offset-2 hover:text-white"
                        >
                          + Add test charge
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="cursor-not-allowed text-white/35 underline decoration-white/15 underline-offset-2"
                      >
                        + Add test charge
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white/90">Test session</span>
                  <span className={state.testSessionActive ? "text-emerald-300" : "text-white/55"}>
                    {state.testSessionActive ? `Active · ${state.testSessionMutations} changes` : "Not active"}
                  </span>
                </div>
                {state.testSessionActive ? (
                  <form action={resetDevTestSessionAction} className="flex justify-end">
                    <input type="hidden" name="return_to" value={pathname} />
                    <input type="hidden" name="session_id" value={state.testSessionId} />
                    <button type="submit" className="text-white/65 underline decoration-white/25 underline-offset-2 hover:text-white">
                      Reset session
                    </button>
                  </form>
                ) : (
                  <form action={startDevTestSessionAction} className="flex justify-end">
                    <input type="hidden" name="return_to" value={pathname} />
                    <button type="submit" className="text-white/65 underline decoration-white/25 underline-offset-2 hover:text-white">
                      Start session
                    </button>
                  </form>
                )}
              </div>
            </div>
          ) : null}

          {state.activeTab === "style" ? (
            <div className="space-y-2 text-[11px] text-white/80">
              {items.map(([label, checked, setChecked]) => (
                <label
                  key={label}
                  className="flex cursor-pointer items-center justify-between gap-3"
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
          ) : null}
        </div>
      </div>
    </>
  );
}
