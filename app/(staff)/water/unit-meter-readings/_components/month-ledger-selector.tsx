"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";

type Props = {
  activeMonthKey: string;
  searchQuery: string;
  monthOptions: MonthOption[];
};

type MonthOption = {
  key: string;
  label: string;
};

function routeForMonth(monthKey: string, searchQuery: string) {
  const params = new URLSearchParams();
  if (searchQuery) params.set("q", searchQuery);
  const query = params.toString();
  return `/water/unit-meter-readings/${monthKey}${query ? `?${query}` : ""}`;
}

export function MonthLedgerSelector({ activeMonthKey, searchQuery, monthOptions }: Props) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);

  const selectedIndex = useMemo(() => monthOptions.findIndex((item) => item.key === activeMonthKey), [activeMonthKey, monthOptions]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    queueMicrotask(() => {
      const item = itemRefs.current[nextIndex];
      item?.scrollIntoView({ block: "center" });
      item?.focus();
    });
  }, [open, selectedIndex]);

  function selectMonth(nextMonth: string) {
    router.replace(routeForMonth(nextMonth, searchQuery));
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className="space-y-2">
      
      <div className="relative inline-block">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Selected month: ${activeMonthKey}`}
          className="group  inline-flex items-center gap-2 rounded-lg bg-transparent text-left text-2xl font-semibold tracking-tight text-zinc-950 transition hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          onClick={() => setOpen((current) => !current)}
        >
          <span>{monthOptions.find((item) => item.key === activeMonthKey)?.label ?? activeMonthKey}</span>
          <CaretDown size={22} className="transition-transform" />
        </button>

        <div
          ref={menuRef}
          role="menu"
          aria-label="Select month"
          aria-hidden={!open}
          className={[
            "absolute left-0 top-[calc(100%+0.75rem)] z-30 w-[18rem] origin-top rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl transition duration-150 ease-out",
            open ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
          ].join(" ")}
        >
          <div className="max-h-60 overflow-auto scroll-py-4 py-2">
            {monthOptions.map((option, index) => {
              const selected = option.key === activeMonthKey;
              return (
                <button
                  key={option.key}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  tabIndex={-1}
                  className={[
                    "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-inset",
                    selected ? "bg-zinc-100 text-zinc-950" : "text-zinc-700 hover:bg-zinc-50",
                  ].join(" ")}
                  onClick={() => selectMonth(option.key)}
                >
                  <span>{option.label}</span>
                  {selected ? <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Selected</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
