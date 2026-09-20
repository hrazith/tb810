"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FunnelSimple } from "@phosphor-icons/react/dist/ssr";

import { Input } from "@/components/ui/input";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";

type OwnerRow = {
  id: string;
  full_name: string;
  owner_reference: string;
  unit_count: number;
};

type UnitRow = {
  id: string;
  unit_number: string;
  floor: string | null;
  unit_type_code: string;
  current_owner_id: string | null;
  current_owner_name: string | null;
  current_owner_reference: string | null;
  participation_percentage: number | null;
};

type PendingSelection =
  | { kind: "owner"; id: string; label: string }
  | { kind: "unit"; id: string; label: string };

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/obligations${search.toString() ? `?${search.toString()}` : ""}`;
}

type Props = {
  mode: "owners" | "units";
  owners: OwnerRow[] | null;
  units: UnitRow[] | null;
  selectedOwnerId: string | null;
  selectedUnitId: string | null;
  error?: string;
  children: React.ReactNode;
};

export function ObligationsNavigationShell({
  mode,
  owners,
  units,
  selectedOwnerId,
  selectedUnitId,
  error,
  children,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [search, setSearch] = useState("");
  const [floor, setFloor] = useState("");
  const committedSelectionId = mode === "owners" ? selectedOwnerId : selectedUnitId;
  const pendingSelectionId = mode === "owners" ? pendingSelection?.kind === "owner" ? pendingSelection.id : null : pendingSelection?.kind === "unit" ? pendingSelection.id : null;
  const visualSelectionId =
    isPending && pendingSelectionId ? pendingSelectionId : committedSelectionId;
  const showPendingDetail = Boolean(isPending && pendingSelectionId && pendingSelectionId !== committedSelectionId);
  const pendingDetailLabel =
    mode === "owners"
      ? pendingSelection?.kind === "owner"
        ? pendingSelection.label
        : null
      : pendingSelection?.kind === "unit"
        ? pendingSelection.label
        : null;

  const normalizedSearch = search.trim().toLowerCase();
  const floorItems: SelectMenuItem[] = [
    { id: "", label: "All floors" },
    ...Array.from(new Set((units ?? []).map((unit) => unit.floor).filter((value): value is string => Boolean(value))))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((value) => ({ id: value, label: `Floor ${value}` })),
  ];
  const visibleOwners = (owners ?? []).filter((owner) => {
    const matchesSearch =
      !normalizedSearch ||
      `${owner.full_name} ${owner.owner_reference}`.toLowerCase().includes(normalizedSearch);
    const matchesFloor =
      !floor || (units ?? []).some((unit) => unit.current_owner_id === owner.id && unit.floor === floor);
    return matchesSearch && matchesFloor;
  });
  const visibleUnits = (units ?? []).filter((unit) => {
    const matchesSearch = !normalizedSearch || unit.unit_number.toLowerCase().includes(normalizedSearch);
    return matchesSearch && (!floor || unit.floor === floor);
  });

  function clearSelection() {
    setPendingSelection(null);
    startTransition(() => {
      router.replace(buildQuery({ mode }));
    });
  }

  return (
    <section className="space-y-6 xl:w-[calc(100vw-8rem)] xl:max-w-none xl:-ml-[calc(50vw-50%-4rem)]">
      

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className=" grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(460px,1fr)]  ">


{/* Items  */}

          <div className="mt-12 pr-1">
            <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="whitespace-nowrap text-2xl text-center font-semibold tracking-tight text-zinc-950">
          Obligations
         </h1>
{/* Toggle  */}
            <div className="flex items-center gap-3">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            className="w-64 rounded-xl border-0 bg-zinc-200 text-zinc-950"
          />
            <div className="inline-flex gap-1 rounded-full bg-zinc-200 p-1">
              <Link
                href={buildQuery({ mode: "owners", ownerId: mode === "owners" ? selectedOwnerId ?? undefined : undefined })}
                onClick={(event) => {
                  event.preventDefault();
                  setPendingSelection(null);
                  router.replace(buildQuery({ mode: "owners", ownerId: mode === "owners" ? selectedOwnerId ?? undefined : undefined }));
                }}
                className={[
                  "rounded-full w-32 py-3 text-center text-sm font-medium transition",
                  mode === "owners" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600",
                ].join(" ")}
              >
                Owners  
              </Link>
              <Link
                href={buildQuery({ mode: "units", unitId: mode === "units" ? selectedUnitId ?? undefined : undefined })}
                onClick={(event) => {
                  event.preventDefault();
                  setPendingSelection(null);
                  router.replace(buildQuery({ mode: "units", unitId: mode === "units" ? selectedUnitId ?? undefined : undefined }));
                }}
                className={[
                  "rounded-full w-32 py-3 text-center text-sm font-medium transition",
                  mode === "units" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600",
                ].join(" ")}
              >
                Units
              </Link>
            </div>
          <SelectMenu
            ariaLabel={mode === "owners" ? "Filter owners by floor" : "Filter units by floor"}
            icon={<FunnelSimple />}
            items={floorItems}
            selectedId={floor}
            onSelect={setFloor}
            align="start"
          />
            </div>
        </div>
            {mode === "owners" ? (
              <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4 mt-12">
                {visibleOwners.map((owner) => {
                  const active = owner.id === visualSelectionId;
                  return (
                    <Link
                      key={owner.id}
                      href={buildQuery({ mode: "owners", ownerId: active ? undefined : owner.id })}
                      onClick={(event) => {
                        event.preventDefault();
                        if (active) {
                          clearSelection();
                          return;
                        }
                        setPendingSelection({ kind: "owner", id: owner.id, label: owner.full_name });
                        startTransition(() => {
                          router.replace(buildQuery({ mode: "owners", ownerId: owner.id }));
                        });
                      }}
                      className={[
                        "block  rounded-3xl border px-6 py-6  shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition",
                        active
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50",
                        isPending && pendingSelectionId === owner.id ? "ring-2 ring-sky-400" : "",
                      ].join(" ")}
                    >

                      <div className="space-y-8">
                        <div className="space-y-2">
                          <div className={["text-xl font-medium tracking-tight", active ? "text-white" : "text-zinc-950"].join(" ")}>
                            {owner.full_name}
                          </div>
                          <div className={["text-sm", active ? "text-zinc-300" : "text-zinc-600"].join(" ")}>
                            {owner.owner_reference}
                          </div>
                        </div>
                        <div className={["text-sm font-medium", active ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                          {owner.unit_count} Units
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mt-12 ">
                {visibleUnits.map((unit) => {
                  const active = unit.id === visualSelectionId;
                  return (
                    <Link
                      key={unit.id}
                      href={buildQuery({ mode: "units", unitId: active ? undefined : unit.id })}
                      onClick={(event) => {
                        event.preventDefault();
                        if (active) {
                          clearSelection();
                          return;
                        }
                        setPendingSelection({ kind: "unit", id: unit.id, label: unit.unit_number });
                        startTransition(() => {
                          router.replace(buildQuery({ mode: "units", unitId: unit.id }));
                        });
                      }}
                      className={[
                        "block rounded-[28px] border px-6 py-6 shadow-[0_1px_0_rgba(15,23,42,0.05)] transition",
                        active
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50",
                        isPending && pendingSelectionId === unit.id ? "ring-2 ring-sky-400" : "",
                      ].join(" ")}
                    >
                      <div className="space-y-8">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2">
                            <div className={["text-3xl font-semibold tracking-tight", active ? "text-white" : "text-zinc-950"].join(" ")}>
                              {unit.unit_number}
                            </div>
                            <div className={["text-lg", active ? "text-zinc-300" : "text-zinc-700"].join(" ")}>
                              {unit.current_owner_name ?? "No owner"}
                            </div>
                          </div>
                          <div className={["text-sm font-medium", active ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                            {unit.participation_percentage ? `${unit.participation_percentage.toFixed(3)}%` : "—"}
                          </div>
                        </div>

                        <div className={["text-sm", active ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                          {unit.current_owner_reference ?? "Current owner"}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
       

{/* Obligation Panel */}

        <div className="self-start space-y-8 border-l border-zinc-200">
          {showPendingDetail ? (
            <div className="flex items-center justify-center px-6 py-10">
              <div className="flex flex-col items-center gap-4 text-center">
                <div
                  aria-hidden="true"
                  className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-950"
                />
                <div className="space-y-1">
                  <div className="text-base font-semibold text-zinc-950">Loading {pendingDetailLabel}…</div>
                  <div className="text-sm text-zinc-500">Fetching the latest obligation details.</div>
                </div>
              </div>
            </div>
          ) : (
            <div
              aria-busy={isPending}
              onClick={(event) => {
                if (event.target instanceof Element && event.target.closest("button[data-obligations-close]")) {
                  clearSelection();
                }
              }}
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
  
