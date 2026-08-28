"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { brandConfig, SignOut } from "@/brand";
import type { StaffContext } from "@/server/staff-context";

type HeaderProps = {
  userEmail: string;
  primaryRoleKey?: StaffContext["primaryRoleKey"];
  signOutAction: () => Promise<void>;
};

export function Header({ userEmail, signOutAction }: HeaderProps) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<"water" | "gas" | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeSection = useMemo(() => {
    if (pathname === "/obligations") return "obligations";
    if (pathname.startsWith("/water/")) return "water";
    if (pathname.startsWith("/gas/")) return "gas";
    return null;
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function cancelClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

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
      </div>
    </header>
  );
}
