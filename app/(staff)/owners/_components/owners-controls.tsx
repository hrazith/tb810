"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FunnelSimple } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";

type Props = {
  initialQuery: string;
  initialStatus: "active" | "archived" | "all";
};

const filterItems: SelectMenuItem[] = [
  { id: "active", label: "Active" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

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

export function OwnersControls({ initialQuery, initialStatus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  function updateParams(next: { q?: string; status?: string }) {
    router.replace(
      buildQueryString(pathname, new URLSearchParams(searchParams.toString()), {
        q: next.q,
        status: next.status,
      }),
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:flex-nowrap xl:items-center xl:justify-end xl:ml-auto">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search owners"
        className="h-11 w-full min-w-0 max-w-xs rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 xl:w-[22rem]"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            updateParams({
              q: query || undefined,
              status: initialStatus,
            });
          }
        }}
      />
      <SelectMenu
        ariaLabel="Filter owners"
        icon={<FunnelSimple />}
        items={filterItems}
        selectedId={initialStatus}
        onSelect={(id) =>
          updateParams({
            q: query || undefined,
            status: id,
          })
        }
      />
      <Button asChild variant="primary" shape="pill">
        <Link href="/owners/new">Add Owner</Link>
      </Button>
    </div>
  );
}
