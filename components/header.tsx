"use client";

import Image from "next/image";
import Link from "next/link";
import { List, X } from "@phosphor-icons/react/dist/ssr";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { brandConfig, SignOut } from "@/brand";
import type { StaffContext } from "@/server/staff-context";

type HeaderProps = {
  userEmail: string;
  primaryRoleKey?: StaffContext["primaryRoleKey"];
  signOutAction: () => Promise<void>;
};

export function Header({ userEmail, primaryRoleKey, signOutAction }: HeaderProps) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<"water" | "gas" | "menu" | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeSection = useMemo(() => {
    if (pathname === "/obligations") return "obligations";
    if (pathname.startsWith("/water/")) return "water";
    if (pathname.startsWith("/gas/")) return "gas";
    if (pathname.startsWith("/finance/budget-plans/")) return "menu";
    if (pathname.startsWith("/owners")) return "menu";
    if (pathname.startsWith("/units")) return "menu";
    return null;
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setOpenMenu(null);
      closeTimerRef.current = null;
    }, 600);
  }

  function openCategory(menu: "water" | "gas") {
    cancelClose();
    setOpenMenu(menu);
  }

  const closeMenu = useCallback(() => {
    cancelClose();
    setOpenMenu(null);
  }, [cancelClose]);

  useEffect(() => {
    if (openMenu !== "menu") return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMenu, openMenu]);

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Go to dashboard home">
            <Image
              src="/TB810.svg"
              alt={brandConfig.shortName}
              width={105}
              height={27}
              priority
            />
          </Link>
          <nav className="ml-12 flex items-center gap-6 text-md font-medium text-zinc-700">
            <div
              className="group relative"
              onMouseEnter={() => openCategory("water")}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                className={[
                  "inline-flex items-center gap-2 transition hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2",
                  activeSection === "water" ? "underline decoration-2 underline-offset-8" : "",
                ].join(" ")}
                aria-haspopup="menu"
                aria-expanded={openMenu === "water"}
                onFocus={() => openCategory("water")}
                onClick={() => setOpenMenu((current) => (current === "water" ? null : "water"))}
              >
                Water
              </button>
              <div
                className={[
                  "absolute left-0 top-full z-30 pt-3 transition",
                  openMenu === "water"
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0",
                ].join(" ")}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                <div className="min-w-60 rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
                  <Link
                    href="/water/sedapal"
                    className={[
                      "flex w-full items-center rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950",
                      pathname === "/water/sedapal" ? "underline decoration-2 underline-offset-4 text-zinc-950" : "text-zinc-700",
                    ].join(" ")}
                  >
                    Sedapal bill
                  </Link>
                  <Link
                    href="/water/unit-meter-readings"
                    className={[
                      "flex w-full items-center rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950",
                      pathname === "/water/unit-meter-readings" ? "underline decoration-2 underline-offset-4 text-zinc-950" : "text-zinc-700",
                    ].join(" ")}
                  >
                    Unit meter readings
                  </Link>
                </div>
              </div>
            </div>
            <div
              className="group relative"
              onMouseEnter={() => openCategory("gas")}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                className={[
                  "inline-flex items-center gap-2 transition hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2",
                  activeSection === "gas" ? "underline decoration-2 underline-offset-8" : "",
                ].join(" ")}
                aria-haspopup="menu"
                aria-expanded={openMenu === "gas"}
                onFocus={() => openCategory("gas")}
                onClick={() => setOpenMenu((current) => (current === "gas" ? null : "gas"))}
              >
                Gas
              </button>
              <div
                className={[
                  "absolute left-0 top-full z-30 pt-3 transition",
                  openMenu === "gas" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
                ].join(" ")}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                <div className="min-w-60 rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
                  <Link
                    href="/gas/bills"
                    className={[
                      "flex w-full items-center rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950",
                      pathname === "/gas/bills" ? "underline decoration-2 underline-offset-4 text-zinc-950" : "text-zinc-700",
                    ].join(" ")}
                  >
                    Supplier bills
                  </Link>
                  <Link
                    href="/gas/readings"
                    className={[
                      "flex w-full items-center rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950",
                      pathname === "/gas/readings" ? "underline decoration-2 underline-offset-4 text-zinc-950" : "text-zinc-700",
                    ].join(" ")}
                  >
                    Gas readings
                  </Link>
                </div>
              </div>
            </div>
            <Link
              href="/obligations"
              className={[
                "inline-flex items-center gap-2 transition hover:text-zinc-950",
                activeSection === "obligations" ? "underline decoration-2 underline-offset-8" : "",
              ].join(" ")}
            >
              Obligations
            </Link>
          </nav>
        </div>

        {primaryRoleKey === "super_admin" ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={openMenu === "menu"}
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 p-2 text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
              onClick={() => setOpenMenu((current) => (current === "menu" ? null : "menu"))}
            >
              <List size={20} weight="bold" />
            </button>

            {openMenu === "menu" ? (
              <div className="fixed inset-0 z-50">
                <button
                  type="button"
                  aria-label="Close menu"
                  className="absolute inset-0 bg-zinc-950/30"
                  onClick={closeMenu}
                />
                <aside
                  role="dialog"
                  aria-modal="true"
                  aria-label="Menu"
                  className="absolute right-0 top-0 h-full w-full max-w-[28rem] overflow-y-auto border-l border-zinc-200 bg-white shadow-[0_18px_40px_rgba(0,0,0,0.12)]"
                >
                  <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-5">
                    <h2 className="text-lg font-semibold text-zinc-950">Menu</h2>
                    <button
                      type="button"
                      aria-label="Close menu"
                      className="inline-flex items-center justify-center rounded-full border border-zinc-300 p-2 text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                      onClick={closeMenu}
                    >
                      <X size={18} weight="bold" />
                    </button>
                  </div>

                  <div className="space-y-8 px-6 py-6">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Link
                        href="/finance/budget-plans/2027"
                        className={[
                          "flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-950 hover:bg-white",
                          pathname.startsWith("/finance/budget-plans/")
                            ? "ring-1 ring-zinc-950/20"
                            : "",
                        ].join(" ")}
                        onClick={closeMenu}
                      >
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                            Budget
                          </p>
                          <p className="text-lg font-semibold text-zinc-950">Budget plans</p>
                        </div>
                      </Link>

                      <Link
                        href="/owners"
                        className={[
                          "flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-950 hover:bg-white",
                          pathname.startsWith("/owners") ? "ring-1 ring-zinc-950/20" : "",
                        ].join(" ")}
                        onClick={closeMenu}
                      >
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                            Owners
                          </p>
                          <p className="text-lg font-semibold text-zinc-950">Unit ownership</p>
                        </div>
                      </Link>

                      <Link
                        href="/units"
                        className={[
                          "flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-950 hover:bg-white",
                          pathname.startsWith("/units") ? "ring-1 ring-zinc-950/20" : "",
                        ].join(" ")}
                        onClick={closeMenu}
                      >
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                            Units
                          </p>
                          <p className="text-lg font-semibold text-zinc-950">Building units</p>
                        </div>
                      </Link>
                    </div>

                    <div className="border-t border-zinc-200 pt-5">
                      <div className="space-y-1 text-sm font-medium text-zinc-700">
                        <p className="rounded-xl px-1 py-2 text-zinc-500">Account settings</p>
                        <p className="rounded-xl px-1 py-2 text-zinc-500">Staff &amp; permissions</p>
                        <p className="rounded-xl px-1 py-2 text-zinc-500">Building settings</p>
                        <p className="rounded-xl px-1 py-2 text-zinc-500">Help</p>
                      </div>

                      <form action={signOutAction} className="mt-3">
                        <button
                          type="submit"
                          className="flex w-full items-center justify-start gap-2 rounded-xl px-1 py-2 text-left text-sm font-medium text-zinc-700 transition hover:text-zinc-950"
                        >
                          <SignOut aria-hidden size={16} />
                          Sign out
                        </button>
                      </form>
                    </div>
                  </div>
                </aside>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <form action={signOutAction} className="flex items-center gap-3">
              <p className="text-sm text-zinc-600">{userEmail}</p>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 transition hover:cursor-pointer hover:border-zinc-950 hover:text-zinc-950"
              >
                <SignOut aria-hidden size={16} />
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
