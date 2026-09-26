"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FilePdf,
  FunnelSimple,
  PencilSimple,
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
import { getAppliedObligationMonthFromReadingDate } from "@/server/water/month";
import type { WaterBillSummary } from "@/server/water";

import {
  createCommonWaterBillAction,
  viewCommonWaterBillAction,
} from "../actions";
import { CommonWaterBillForm } from "./common-water-bill-form";

type Props = {
  bills: WaterBillSummary[];
  previousReading: string;
  devTestContext?: boolean;
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

function formatAppliedMonth(bill: WaterBillSummary) {
  const monthKey = getAppliedObligationMonthFromReadingDate(bill.bill_date);
  if (!monthKey) return "—";
  return formatMonthYear(new Date(`${monthKey}-01T00:00:00Z`));
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
          <th aria-label="PDF action" className="px-3 py-3.5" />
          <th className="px-3 py-3.5 text-left text-sm font-medium text-zinc-400 sm:pl-0">
            Service Month
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-medium text-zinc-400">
            Reading Date
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-medium text-zinc-400">
            Previous
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-medium text-zinc-400">
            Current
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-medium text-zinc-400">
            Consumption
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-medium text-zinc-400">
            Unit Cost
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-medium text-zinc-400">
            Applied to
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-medium text-zinc-400">
            Invoice Amount
          </th>
          <th aria-label="Edit action" className="px-3 py-3.5" />
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-200 bg-white">
        {bills.map((bill) => (
          <tr
            key={bill.id}
            className={bill.is_editable ? "group cursor-pointer hover:bg-zinc-50" : "group hover:bg-zinc-50"}
          >
            <td className="px-3 py-6 text-sm whitespace-nowrap text-zinc-600">
              {bill.document ? (
                <form action={viewCommonWaterBillAction}>
                  <input type="hidden" name="utility_bill_id" value={bill.id} />
                  <button
                    type="submit"
                    className="inline-flex rounded-md p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
                    aria-label={`Open PDF for ${formatServiceMonth(bill.bill_date)}`}
                  >
                    <FilePdf size={20} aria-hidden="true" />
                  </button>
                </form>
              ) : null}
            </td>
            <td className="px-3 py-6 text-sm font-normal whitespace-nowrap text-zinc-900 sm:pl-0">
              {formatServiceMonth(bill.bill_date)}
            </td>
            <td className="px-3 py-6 text-sm whitespace-nowrap text-zinc-600">
              {formatPeruvianDate(bill.bill_date)}
            </td>
            <td className="px-3 py-6 text-sm whitespace-nowrap text-zinc-600">
              {formatReading(bill.previous_reading)}
            </td>
            <td className="px-3 py-6 text-sm whitespace-nowrap text-zinc-600">
              {formatReading(bill.current_reading)}
            </td>
            <td className="px-3 py-6 text-sm whitespace-nowrap text-zinc-600">
              {formatReading(bill.total_consumption)}
            </td>
            <td className="px-3 py-6 text-sm whitespace-nowrap text-zinc-600">
              {formatMoney(bill.unit_cost)}
            </td>
            <td className="px-3 py-6 text-sm whitespace-nowrap text-zinc-600">
              <span className="font-medium text-zinc-900">{formatAppliedMonth(bill)}</span>
            </td>
            <td className="px-3 py-6 text-sm font-semibold whitespace-nowrap text-zinc-900">
              {formatMoney(bill.amount)}
            </td>
            <td className="px-3 py-6 text-sm whitespace-nowrap text-zinc-600">
              {bill.is_editable ? (
                <Link
                  href={`/water/sedapal/${bill.id}/edit`}
                  className="inline-flex items-center gap-1 rounded-md text-zinc-700 opacity-0 underline decoration-zinc-300 underline-offset-4 transition group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
                >
                  <PencilSimple size={16} aria-hidden="true" />
                  Edit
                </Link>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WaterLedgerWorkspace({ bills, previousReading, devTestContext = false }: Props) {
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
      <div className="grid  gap-4 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center my-12 px-6">
        <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-zinc-950">
          Sedapal Water Ledger
        </h1>
        <div className=" flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:flex-nowrap xl:items-center xl:justify-end xl:ml-auto">
            <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-11 w-full min-w-0 max-w-xs rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 xl:w-[22rem]"
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
        </div>
      </div>

      {filteredBills.length === 0 ? (
        <Panel className="border-dashed border-zinc-300 text-center text-sm text-zinc-600">
          No common water bills recorded yet.
        </Panel>
      ) : (
        <div className="flow-root">
          <div className=" overflow-x-auto ">
            <div className="inline-block min-w-full align-middle sm:px-6 lg:px-6 ">
              <WaterLedgerTable bills={filteredBills} />
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={composeOpen}
        title="Add Sedapal Bill"
        className="m-auto w-full max-w-sm rounded-2xl"
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
          submitLabel="Save Sedapal Bill"
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
          devTestContext={devTestContext}
        />
      </Dialog>

      <Button
        ref={triggerRef}
        type="button"
        variant="primary"
        shape="pill"
        className="fixed bottom-4 right-4 z-40 shadow-lg sm:bottom-6 sm:right-6"
        onClick={openModal}
      >
        <PlusCircleIcon size={28} />
        Monthly Reading
      </Button>
    </section>
  );
}
