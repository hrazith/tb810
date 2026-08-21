"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type OwnerRow = {
  id: string;
  full_name: string;
  owner_reference: string;
  unit_count: number;
};

type UnitRow = {
  id: string;
  unit_number: string;
  unit_type_code: string;
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
  const committedSelectionId = mode === "owners" ? selectedOwnerId : selectedUnitId;
  const pendingSelectionId = mode === "owners" ? pendingSelection?.kind === "owner" ? pendingSelection.id : null : pendingSelection?.kind === "unit" ? pendingSelection.id : null;
  const visualSelectionId =
    pendingSelectionId && pendingSelectionId !== committedSelectionId ? pendingSelectionId : committedSelectionId;
  const showPendingDetail = Boolean(pendingSelectionId && pendingSelectionId !== committedSelectionId);
  const pendingDetailLabel =
    mode === "owners"
      ? pendingSelection?.kind === "owner"
        ? pendingSelection.label
        : null
      : pendingSelection?.kind === "unit"
        ? pendingSelection.label
        : null;

  return (
    <section className="space-y-6 xl:w-[calc(100vw-3rem)] xl:max-w-none xl:-ml-[calc(50vw-50%-1.5rem)] test">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Obligations</h1>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-[28px] bg-zinc-100 p-1">
            <div className="grid grid-cols-2 gap-1">
              <Link
                href={buildQuery({ mode: "owners", ownerId: selectedOwnerId ?? undefined })}
                onClick={(event) => {
                  event.preventDefault();
                  router.replace(buildQuery({ mode: "owners", ownerId: selectedOwnerId ?? undefined }));
                }}
                className={[
                  "rounded-2xl px-6 py-4 text-center text-xl font-semibold transition",
                  mode === "owners" ? "bg-zinc-950 text-white shadow-sm ring-2 ring-sky-500" : "text-zinc-500",
                ].join(" ")}
              >
                Owners
              </Link>
              <Link
                href={buildQuery({ mode: "units", unitId: selectedUnitId ?? undefined })}
                onClick={(event) => {
                  event.preventDefault();
                  router.replace(buildQuery({ mode: "units", unitId: selectedUnitId ?? undefined }));
                }}
                className={[
                  "rounded-2xl px-6 py-4 text-center text-xl font-semibold transition",
                  mode === "units" ? "bg-zinc-950 text-white shadow-sm ring-2 ring-sky-500" : "text-zinc-500",
                ].join(" ")}
              >
                Units
              </Link>
            </div>
          </div>

          <div className="max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
            {mode === "owners" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                {(owners ?? []).map((owner) => {
                  const active = owner.id === visualSelectionId;
                  return (
                    <Link
                      key={owner.id}
                      href={buildQuery({ mode: "owners", ownerId: owner.id })}
                      onClick={(event) => {
                        event.preventDefault();
                        setPendingSelection({ kind: "owner", id: owner.id, label: owner.full_name });
                        startTransition(() => {
                          router.replace(buildQuery({ mode: "owners", ownerId: owner.id }));
                        });
                      }}
                      className={[
                        "block rounded-[28px] border px-6 py-6 shadow-[0_1px_0_rgba(15,23,42,0.05)] transition",
                        active
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50",
                        isPending && pendingSelectionId === owner.id ? "ring-2 ring-sky-400" : "",
                      ].join(" ")}
                    >
                      <div className="space-y-8">
                        <div className="space-y-2">
                          <div className={["text-2xl font-semibold tracking-tight", active ? "text-white" : "text-zinc-950"].join(" ")}>
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
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                {(units ?? []).map((unit) => {
                  const active = unit.id === visualSelectionId;
                  return (
                    <Link
                      key={unit.id}
                      href={buildQuery({ mode: "units", unitId: unit.id })}
                      onClick={(event) => {
                        event.preventDefault();
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
        </div>

        <div className="space-y-8 rounded-[24px] border border-zinc-200 bg-white p-5">
          {showPendingDetail ? (
            <div className="flex min-h-[28rem] items-center justify-center rounded-[24px] border border-zinc-200 bg-zinc-50 px-6 py-10">
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
            <div aria-busy={isPending}>{children}</div>
          )}
        </div>
      </div>
    </section>
  );
}
