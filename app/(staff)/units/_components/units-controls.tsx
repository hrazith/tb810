"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FunnelSimple } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";

type UnitTypeOption = {
  id: string;
  name: string;
};

type Props = {
  initialQuery: string;
  initialUnitTypeId: string;
  unitTypes: UnitTypeOption[];
};

function buildQueryString(
  pathname: string,
  currentParams: URLSearchParams,
  next: Record<string, string | undefined>,
) {
  const params = new URLSearchParams(currentParams);
  for (const [key, value] of Object.entries(next)) {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function UnitsControls({
  initialQuery,
  initialUnitTypeId,
  unitTypes,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  const filterItems: SelectMenuItem[] = [
    { id: "", label: "All types" },
    ...unitTypes.map((unitType) => ({
      id: unitType.id,
      label: unitType.name,
    })),
  ];

  function updateParams(next: { q?: string; unitTypeId?: string }) {
    router.replace(
      buildQueryString(pathname, new URLSearchParams(searchParams.toString()), {
        q: next.q,
        unitTypeId: next.unitTypeId,
      }),
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:flex-nowrap xl:items-center xl:justify-end xl:ml-auto">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by unit number, floor, or type"
        className="xl:w-[24rem]"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            updateParams({
              q: query || undefined,
              unitTypeId: initialUnitTypeId || undefined,
            });
          }
        }}
      />
      <SelectMenu
        ariaLabel="Filter units"
        icon={<FunnelSimple />}
        items={filterItems}
        selectedId={initialUnitTypeId}
        onSelect={(id) =>
          updateParams({
            q: query || undefined,
            unitTypeId: id || undefined,
          })
        }
      />
      <Button asChild variant="primary" shape="pill">
        <Link href="/units/new">Add Unit</Link>
      </Button>
    </div>
  );
}
