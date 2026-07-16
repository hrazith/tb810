"use client";

import { useMemo, useState } from "react";

type OwnerOption = {
  id: string;
  full_name: string;
  owner_reference: string;
  active: boolean;
};

type Props = {
  owners: OwnerOption[];
  value?: string;
  onChange: (ownerId: string) => void;
  invalid?: boolean;
  describedBy?: string;
};

export function OwnerPicker({
  owners,
  value,
  onChange,
  invalid = false,
  describedBy,
}: Props) {
  const [query, setQuery] = useState("");

  const filteredOwners = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return owners;

    return owners.filter((owner) =>
      [owner.full_name, owner.owner_reference]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [owners, query]);

  return (
    <div className="space-y-3">
      <label className="block space-y-2">
        <span className="block text-sm font-medium text-zinc-900">
          Search owner
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or reference"
          className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
        />
      </label>

      <div
        role="radiogroup"
        aria-label="Incoming owner"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="grid gap-2 md:grid-cols-2"
      >
        {filteredOwners.map((owner) => {
          const checked = owner.id === value;
          return (
            <label
              key={owner.id}
              className={`flex cursor-pointer flex-col items-start rounded-xl border px-4 py-3 text-left text-sm transition focus-within:ring-2 focus-within:ring-zinc-950 focus-within:ring-offset-2 ${
                checked
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950"
              }`}
            >
              <input
                type="radio"
                name="owner_id"
                value={owner.id}
                checked={checked}
                onChange={() => onChange(owner.id)}
                className="sr-only"
              />
              <span className="font-medium">{owner.full_name}</span>
              <span className="text-xs opacity-80">{owner.owner_reference}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
