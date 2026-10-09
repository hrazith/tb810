import type { GasBillSummary } from "./types";

// Processed Gas purchases consumed outside TB810, grouped only by billing-group
// provenance stored on the purchase. Purchase dates never assign membership;
// purchases without a recorded group are shown together, labelled as such.

export type GasHistoricalGroup = {
  key: string;
  label: string;
  detail: string;
  bills: GasBillSummary[];
  total: number;
  // The source ledger's own group total, when it differs from the purchases on record.
  ledgerTotal: number | null;
};

type Metadata = Record<string, unknown>;

function metadataOf(bill: GasBillSummary): Metadata {
  return bill.legacy_metadata && typeof bill.legacy_metadata === "object" ? (bill.legacy_metadata as Metadata) : {};
}

// B002-TEST-SEP02 is the test supplier bill used by the approved September 2026
// test package. It stays intact and is shown apart from real purchases.
export function isGasTestRecord(bill: Pick<GasBillSummary, "invoice_number">) {
  return /-TEST-/i.test(bill.invoice_number ?? "");
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function dateRange(bills: GasBillSummary[]) {
  const dates = bills.map((bill) => bill.invoice_date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? formatDay(first) : `${formatDay(first)} – ${formatDay(last)}`;
}

function cycleLabel(cycle: string) {
  const match = /^([a-z]+)_(\d{4})_cycle$/.exec(cycle);
  if (!match) return cycle;
  return `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]} cycle`;
}

function sum(bills: GasBillSummary[]) {
  return Math.round(bills.reduce((total, bill) => total + Number(bill.amount), 0) * 100) / 100;
}

function group(key: string, detail: string, bills: GasBillSummary[], ledgerTotal: number | null = null): GasHistoricalGroup {
  const ordered = [...bills].sort((left, right) => right.invoice_date.localeCompare(left.invoice_date));
  const total = sum(ordered);
  return {
    key,
    label: dateRange(ordered),
    detail,
    bills: ordered,
    total,
    ledgerTotal: ledgerTotal !== null && Math.abs(ledgerTotal - total) > 0.005 ? ledgerTotal : null,
  };
}

export function groupHistoricalGasBills(bills: GasBillSummary[]): GasHistoricalGroup[] {
  const groups: GasHistoricalGroup[] = [];
  const ledgerGroups = new Map<string, GasBillSummary[]>();
  const cycleGroups = new Map<string, GasBillSummary[]>();
  const consumoRows: Array<{ row: number; bill: GasBillSummary; marker: number | null }> = [];
  const unrecorded: GasBillSummary[] = [];

  for (const bill of bills) {
    const metadata = metadataOf(bill);
    const processing = metadata.historical_processing as Metadata | undefined;
    const ledgerGroup = typeof processing?.ledger_group === "string" ? processing.ledger_group : null;
    const cycle = typeof metadata.historical_cycle === "string" ? metadata.historical_cycle : null;
    const row = Number(metadata.source_row_number);
    if (ledgerGroup) {
      ledgerGroups.set(ledgerGroup, [...(ledgerGroups.get(ledgerGroup) ?? []), bill]);
    } else if (cycle && cycle !== "historically_consumed") {
      cycleGroups.set(cycle, [...(cycleGroups.get(cycle) ?? []), bill]);
    } else if (metadata.source_sheet === "Consumo" && Number.isInteger(row)) {
      const marker = metadata.source_extra_marker == null ? null : Number(metadata.source_extra_marker);
      consumoRows.push({ row, bill, marker: Number.isFinite(marker) ? marker : null });
    } else {
      unrecorded.push(bill);
    }
  }

  for (const [ledgerGroup, members] of ledgerGroups) {
    groups.push(group(`ledger:${ledgerGroup}`, "Canonical supplier ledger group · consumed outside TB810", members));
  }
  for (const [cycle, members] of cycleGroups) {
    groups.push(group(`cycle:${cycle}`, `${cycleLabel(cycle)} (recorded at import) · consumed outside TB810`, members));
  }

  // The ConsumoDeGas "Consumo" sheet closes each billing group on the row that
  // carries its "Total del Mes"; rows after the last recorded total have no
  // recorded group.
  consumoRows.sort((left, right) => left.row - right.row);
  let open: typeof consumoRows = [];
  for (const entry of consumoRows) {
    open.push(entry);
    if (entry.marker !== null) {
      const first = open[0].row;
      groups.push(group(`consumo:${first}-${entry.row}`, "Legacy billing group (Consumo sheet) · consumed outside TB810", open.map((item) => item.bill), entry.marker));
      open = [];
    }
  }
  unrecorded.push(...open.map((item) => item.bill));
  if (unrecorded.length) {
    const unrecordedGroup = group("unrecorded", "", unrecorded);
    groups.push({
      ...unrecordedGroup,
      label: "Billing group not recorded",
      detail: `Purchases dated ${unrecordedGroup.label} · consumed outside TB810`,
    });
  }

  // Newest first by recorded sequence, not by purchase date (some legacy rows
  // carry out-of-sequence dates): ledger groups, imported cycles, purchases
  // without a recorded group, then Consumo-sheet groups by sheet row.
  const rank = (key: string) => (key.startsWith("ledger:") ? 0 : key.startsWith("cycle:") ? 1 : key === "unrecorded" ? 2 : 3);
  const sheetRow = (key: string) => Number(key.split(":")[1]?.split("-")[0] ?? 0);
  return groups.sort((left, right) => rank(left.key) - rank(right.key) || sheetRow(right.key) - sheetRow(left.key));
}
