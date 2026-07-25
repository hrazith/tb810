"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { WaterBillSummary } from "@/server/water";

import { createCommonWaterBillAction } from "../actions";
import { CommonWaterBillForm } from "./common-water-bill-form";

type Props = {
  bills: WaterBillSummary[];
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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

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
          <th className="px-3 py-3.5  text-left text-sm font-semibold text-zinc-900">
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
            className="cursor-pointer hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none test"
          >
            <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-zinc-900 sm:pl-0">
              {formatServiceMonth(bill.bill_date)}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-600">
              {bill.bill_date}
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

export function WaterLedgerWorkspace({ bills }: Props) {
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

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Common Water Ledger
        </h1>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="h-11 w-full max-w-xs rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          className="h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition focus:border-zinc-950"
        >
          <option value="all">Filter</option>
          <option value="open">Open</option>
          <option value="locked">Locked</option>
        </select>
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
          className="h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition focus:border-zinc-950"
        >
          <option value="newest">Sort</option>
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </select>
        <Button
          type="button"
          variant="primary"
          shape="pill"
          onClick={() => setComposeOpen((open) => !open)}
        >
          + Monthly Reading
        </Button>
      </div>

      <div className="relative">
        <div className="absolute bottom-full left-0 z-20 mb-3 w-full max-w-sm">
          <Panel
            className={`transition ${
              composeOpen
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0"
            }`}
          >
            <CommonWaterBillForm
              action={createCommonWaterBillAction}
              submitLabel="Save Reading"
              previousReadingHelpText="Loaded automatically from the most recent prior Sedapal reading."
              previousReadingLabel="Previous Reading"
              previousReadingReadOnly
              showDescription={false}
              showNotes={false}
              showSummary={false}
              compact
              hideCancel={false}
              onCancel={() => setComposeOpen(false)}
            />
          </Panel>
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
      </div>
    </section>
  );
}
