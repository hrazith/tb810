"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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
  | { kind: "owner"; id: string }
  | { kind: "unit"; id: string };

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
};

export function ObligationsSidebarNav({
  mode,
  owners,
  units,
  selectedOwnerId,
  selectedUnitId,
  error,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);

  useEffect(() => {
    if (pendingSelection?.kind === "owner" && pendingSelection.id === selectedOwnerId) {
      setPendingSelection(null);
    }
    if (pendingSelection?.kind === "unit" && pendingSelection.id === selectedUnitId) {
      setPendingSelection(null);
    }
  }, [pendingSelection, selectedOwnerId, selectedUnitId]);

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] bg-zinc-100 p-1">
        <div className="grid grid-cols-2 gap-1">
          <Link
            href={buildQuery({ mode: "owners", ownerId: selectedOwnerId ?? undefined })}
            className={[
              "rounded-2xl px-6 py-4 text-center text-xl font-semibold transition",
              mode === "owners" ? "bg-zinc-950 text-white shadow-sm ring-2 ring-sky-500" : "text-zinc-500",
            ].join(" ")}
          >
            Owners
          </Link>
          <Link
            href={buildQuery({ mode: "units", unitId: selectedUnitId ?? undefined })}
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
              const optimistic = pendingSelection?.kind === "owner" && pendingSelection.id === owner.id;
              const active = optimistic || owner.id === selectedOwnerId;
              return (
                <Link
                  key={owner.id}
                  href={buildQuery({ mode: "owners", ownerId: owner.id, error })}
                  onClick={(event) => {
                    event.preventDefault();
                    setPendingSelection({ kind: "owner", id: owner.id });
                    startTransition(() => {
                      router.push(buildQuery({ mode: "owners", ownerId: owner.id, error }));
                    });
                  }}
                  className={[
                    "block rounded-[28px] border px-6 py-6 shadow-[0_1px_0_rgba(15,23,42,0.05)] transition",
                    active
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50",
                    isPending && optimistic ? "ring-2 ring-sky-400" : "",
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
              const optimistic = pendingSelection?.kind === "unit" && pendingSelection.id === unit.id;
              const active = optimistic || unit.id === selectedUnitId;
              return (
                <Link
                  key={unit.id}
                  href={buildQuery({ mode: "units", unitId: unit.id, error })}
                  onClick={(event) => {
                    event.preventDefault();
                    setPendingSelection({ kind: "unit", id: unit.id });
                    startTransition(() => {
                      router.push(buildQuery({ mode: "units", unitId: unit.id, error }));
                    });
                  }}
                  className={[
                    "block rounded-[28px] border px-6 py-6 shadow-[0_1px_0_rgba(15,23,42,0.05)] transition",
                    active
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50",
                    isPending && optimistic ? "ring-2 ring-sky-400" : "",
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
  );
}
