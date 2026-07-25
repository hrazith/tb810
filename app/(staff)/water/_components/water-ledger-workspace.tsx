"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FunnelSimple,
  PlusCircleIcon,
  SortAscending,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";
import {
  formatMonthYear,
  formatPeruvianDate,
  getServiceMonthFromReadingDate,
} from "@/lib/water-dates";
import type { WaterBillSummary } from "@/server/water";

import { createCommonWaterBillAction } from "../actions";
import { CommonWaterBillForm } from "./common-water-bill-form";

type Props = {
  bills: WaterBillSummary[];
  previousReading: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatReading(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function formatServiceMonth(value: string) {
  return formatMonthYear(getServiceMonthFromReadingDate(value));
}

const filterItems: SelectMenuItem[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "locked", label: "Locked" },
];

const sortItems: SelectMenuItem[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
];

function WaterLedgerTable({ bills }: { bills: WaterBillSummary[] }) {
  return (
    <table className="relative min-w-full divide-y divide-zinc-300">
      <thead>
        <tr>
          <th className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-zinc-900 sm:pl-0">
            Service Month
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Reading Date
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Previous Reading
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Current Reading
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Consumption
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Unit Cost
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Invoice Amount
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-200 bg-white">
        {bills.map((bill) => (
          <tr
            key={bill.id}
            role="link"
            tabIndex={0}
            aria-label={`View ${formatServiceMonth(bill.bill_date)}`}
            onClick={() => {
              window.location.href = `/water/${bill.id}`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                window.location.href = `/water/${bill.id}`;
              }
            }}
            className="cursor-pointer hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none"
          >
            <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-zinc-900 sm:pl-0">
              {formatServiceMonth(bill.bill_date)}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-600">
              {formatPeruvianDate(bill.bill_date)}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-600">
              {formatReading(bill.previous_reading)}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-600">
              {formatReading(bill.current_reading)}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-600">
              {formatReading(bill.total_consumption)}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-600">
              {formatMoney(bill.unit_cost)}
            </td>
            <td className="px-3 py-4 text-sm font-semibold whitespace-nowrap text-zinc-900">
              {formatMoney(bill.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WaterLedgerWorkspace({ bills, previousReading }: Props) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previousComposeOpenRef = useRef(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "locked">("all");
  const [sortKey, setSortKey] = useState<"newest" | "oldest">("newest");
  const [composeOpen, setComposeOpen] = useState(false);

  const filteredBills = useMemo(() => {
    const filtered = bills.filter((bill) => {
      const matchesQuery =
        !query ||
        [bill.bill_date, formatServiceMonth(bill.bill_date), bill.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());
      const matchesStatus =
        status === "all" ||
        (status === "open" ? bill.is_editable : !bill.is_editable);
      return matchesQuery && matchesStatus;
    });

    filtered.sort((a, b) =>
      sortKey === "newest"
        ? new Date(`${b.bill_date}T00:00:00`).getTime() -
          new Date(`${a.bill_date}T00:00:00`).getTime()
        : new Date(`${a.bill_date}T00:00:00`).getTime() -
          new Date(`${b.bill_date}T00:00:00`).getTime(),
    );

    return filtered;
  }, [bills, query, sortKey, status]);

  useEffect(() => {
    if (previousComposeOpenRef.current && !composeOpen) {
      triggerRef.current?.focus();
    }
    previousComposeOpenRef.current = composeOpen;
  }, [composeOpen]);

  function openModal() {
    setComposeOpen(true);
  }

  function closeModal() {
    setComposeOpen(false);
  }

  function handleSuccess() {
    setComposeOpen(false);
    router.refresh();
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center">
        <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-zinc-950">
          Common Water Ledger
        </h1>
        <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:flex-nowrap xl:items-center xl:justify-end xl:ml-auto">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-11 w-full min-w-0 max-w-xs rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 xl:w-[22rem]"
          />
          <SelectMenu
            ariaLabel="Filter water bills"
            icon={<FunnelSimple />}
            items={filterItems}
            selectedId={status}
            onSelect={(id) => setStatus(id as typeof status)}
          />
          <SelectMenu
            ariaLabel="Sort water bills"
            icon={<SortAscending />}
            items={sortItems}
            selectedId={sortKey}
            onSelect={(id) => setSortKey(id as typeof sortKey)}
          />
          <Button
            ref={triggerRef}
            type="button"
            variant="primary"
            shape="pill"
            className="cursor-pointer"
            onClick={openModal}
          >
            <PlusCircleIcon size={20} />
            Monthly Reading
          </Button>
        </div>
      </div>

      {filteredBills.length === 0 ? (
        <Panel className="border-dashed border-zinc-300 text-center text-sm text-zinc-600">
          No common water bills recorded yet.
        </Panel>
      ) : (
        <div className="flow-root">
          <div className="-mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full align-middle sm:px-6 lg:px-8">
              <WaterLedgerTable bills={filteredBills} />
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={composeOpen}
        title="Add Monthly Reading"
        description="Record the current master-meter reading and supplier invoice amount."
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeModal();
          } else {
            openModal();
          }
        }}
      >
        <CommonWaterBillForm
          action={createCommonWaterBillAction}
          submitLabel="Save Reading"
          previousReadingHelpText="Loaded automatically from the most recent prior Sedapal reading."
          previousReadingLabel="Previous Reading"
          previousReadingReadOnly
          initialValues={{
            previous_reading: previousReading,
          }}
          showDescription={false}
          showNotes={false}
          showSummary={false}
          compact
          hideCancel={false}
          onCancel={closeModal}
          onSuccess={handleSuccess}
        />
      </Dialog>
    </section>
  );
}
