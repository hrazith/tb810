import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { AvisoLine, AvisoLineKind, OwnerAvisoData } from "./owner-aviso-data";
import { PDF_FONT_FAMILY } from "./pdf-fonts";

// AVISO DE PAGO preview: A4 portrait, read-only, never an issued document.
// Presentation only: every amount arrives final from owner-aviso-data.ts.
// Only the grand total carries the currency; there are no subtotals.

const DRAFT_LABEL = "BORRADOR — NO EMITIDO";
const BUILDING_TITLE = "Edificio Torre Balta";
const BUILDING_SUBTITLE = "Junta de Propietarios";
// Used until the building's address is configured in tb810_buildings.
const BUILDING_ADDRESS = "Malecón Balta 810 · Miraflores, Lima";
// Payment instructions are printed only once verified; until then the block
// says so instead of showing an account.
const PAYMENT_DETAILS: Array<[label: string, value: string]> = [["Datos bancarios", "Pendientes de confirmación"]];
const OWNER_DIRECT_LABEL = "Propietario";

const UNIT_TYPES: Record<string, { singular: string; plural: string }> = {
  condo: { singular: "Departamento", plural: "Departamentos" },
  parking: { singular: "Estacionamiento", plural: "Estacionamientos" },
  storage: { singular: "Depósito", plural: "Depósitos" },
};

const GROUPS: Array<{ title: string; kinds: AvisoLineKind[] }> = [
  { title: "Cuotas fijas", kinds: ["fixed"] },
  { title: "Agua", kinds: ["water", "common_water"] },
  { title: "Gas", kinds: ["gas"] },
  { title: "Otros cargos", kinds: ["other"] },
];

const MUTED = "#6b6b6b";
const RULE = "#d1d1d1";
const FAINT_RULE = "#e6e6e6";
const MARGIN = 56;
const AMOUNT_WIDTH = 96;

const styles = StyleSheet.create({
  page: { fontFamily: PDF_FONT_FAMILY, fontSize: 9.5, color: "#000000", paddingTop: 100, paddingBottom: 72, paddingHorizontal: MARGIN },
  muted: { color: MUTED },
  row: { flexDirection: "row", justifyContent: "space-between" },
  amount: { width: AMOUNT_WIDTH, textAlign: "right" },

  // First-page header sits in the top margin reserved for continuation headers.
  header: { flexDirection: "row", justifyContent: "space-between", marginTop: -52, paddingBottom: 18, borderBottomWidth: 0.5, borderBottomColor: RULE },
  buildingTitle: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  buildingSubtitle: { fontSize: 8.5, fontWeight: 500, marginBottom: 5 },
  headerMeta: { fontSize: 8.5, color: MUTED, marginBottom: 5 },
  documentMeta: { width: 120, paddingTop: 6 },
  periodLabel: { fontSize: 8.5, fontWeight: 500 },
  draftLabel: { fontSize: 7.5, fontWeight: 500, color: MUTED, letterSpacing: 0.5, marginBottom: 5 },

  continuation: { position: "absolute", top: 42, left: MARGIN, right: MARGIN },
  continuationBody: { paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: RULE },
  // One line only (maxLines is ignored in render callbacks); a long name is clipped, never overlapping the content.
  continuationOwner: { height: 11, overflow: "hidden", marginTop: 4, fontSize: 8.5, color: MUTED },

  owner: { marginTop: 28 },
  ownerName: { fontSize: 18, fontWeight: 700, marginBottom: 5 },
  ownerUnits: { fontSize: 8.5, lineHeight: 1.4 },

  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28 },
  totalLabel: { fontSize: 9, fontWeight: 500, marginBottom: 4 },
  totalNote: { fontSize: 8.5, lineHeight: 1.4 },
  totalAmount: { fontSize: 20, fontWeight: 700 },
  totalCurrency: { fontSize: 12, fontWeight: 400 },

  detailHeader: { flexDirection: "row", justifyContent: "space-between", marginTop: 26, paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: RULE, fontSize: 8.5 },
  group: { marginTop: 12 },
  groupTitle: { fontSize: 9, fontWeight: 500, marginBottom: 3 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 12, paddingVertical: 3.5 },
  detailEnd: { marginTop: 12, borderTopWidth: 0.5, borderTopColor: RULE },
  // At most two lines per charge; longer descriptions end in an ellipsis.
  lineLabel: { flex: 1, paddingRight: 16, maxLines: 2, textOverflow: "ellipsis" },

  payment: { marginTop: 30, fontSize: 8.5 },
  paymentRow: { flexDirection: "row", marginTop: 5 },
  paymentLabel: { width: 90, color: MUTED },
  paymentValue: { flex: 1 },

  footer: { position: "absolute", bottom: 30, left: MARGIN, right: MARGIN, flexDirection: "row", justifyContent: "space-between", paddingTop: 7, borderTopWidth: 0.5, borderTopColor: FAINT_RULE, fontSize: 7.5, color: MUTED },
});

function monthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthKey}-01T00:00:00Z`));
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function formatAmount(amount: string) {
  const [whole, fraction = "00"] = Number(amount).toFixed(2).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function unitTitle(unit: { unitTypeCode: string; unitNumber: string }) {
  return `${UNIT_TYPES[unit.unitTypeCode]?.singular ?? "Unidad"} ${unit.unitNumber}`;
}

// "Departamento 1402 · Estacionamientos E-30, E-31 · Depósito D-15"
function compactUnitList(units: OwnerAvisoData["units"]) {
  const byType = new Map<string, string[]>();
  for (const unit of units) byType.set(unit.unitTypeCode, [...(byType.get(unit.unitTypeCode) ?? []), unit.unitNumber]);
  return [...byType]
    .map(([type, numbers]) => {
      const names = UNIT_TYPES[type] ?? { singular: "Unidad", plural: "Unidades" };
      return `${numbers.length === 1 ? names.singular : names.plural} ${numbers.join(", ")}`;
    })
    .join(" · ");
}

type DetailRow = { key: string; line: AvisoLine; title: string };

// One line of text per charge, "who · what": Fixed and Gas rows are named by
// their Unit, Water rows add which Water charge, other charges add their
// description, and Owner-direct charges are attributed to the Owner.
function detailRows(data: OwnerAvisoData) {
  const rows: DetailRow[] = [];
  data.units.forEach((unit, unitIndex) => {
    const unitName = unitTitle(unit);
    unit.lines.forEach((line, lineIndex) => {
      const key = `${unitIndex}-${lineIndex}`;
      if (line.kind === "water") rows.push({ key, line, title: `${unitName} · Consumo` });
      else if (line.kind === "common_water") rows.push({ key, line, title: `${unitName} · Agua común` });
      else if (line.kind === "other") rows.push({ key, line, title: `${unitName} · ${line.label}` });
      else rows.push({ key, line, title: unitName });
    });
  });
  data.ownerDirect?.lines.forEach((line, index) => rows.push({ key: `owner-${index}`, line, title: `${OWNER_DIRECT_LABEL} · ${line.label}` }));
  return rows;
}

function ChargeRow({ row }: { row: DetailRow }) {
  return (
    <View style={styles.line} wrap={false}>
      <Text style={styles.lineLabel}>{row.title}</Text>
      <Text style={styles.amount}>{formatAmount(row.line.amount)}</Text>
    </View>
  );
}

export function OwnerAvisoDocument({ data, generatedAt }: { data: OwnerAvisoData; generatedAt: Date }) {
  const period = capitalize(monthLabel(data.obligationMonth));
  const generated = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" }).format(generatedAt);
  const rows = detailRows(data);

  return (
    <Document title={`AVISO DE PAGO ${period} ${data.owner.reference} (borrador)`} producer="TB810" creator="TB810" language="es-PE">
      <Page size="A4" style={styles.page}>
        <View
          fixed
          style={styles.continuation}
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={styles.continuationBody}>
                <View style={styles.row}>
                  <Text style={{ fontSize: 9, fontWeight: 700 }}>AVISO DE PAGO · {period}</Text>
                  <Text style={[styles.draftLabel, { marginTop: 0 }]}>{DRAFT_LABEL}</Text>
                </View>
                <View style={styles.continuationOwner}>
                  <Text>
                    {data.owner.reference} · {data.owner.name}
                  </Text>
                </View>
              </View>
            ) : null
          }
        />

        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: 24 }}>
            <Text style={styles.buildingTitle}>{BUILDING_TITLE}</Text>
            <Text style={styles.buildingSubtitle}>{BUILDING_SUBTITLE}</Text>
            <Text style={styles.headerMeta}>{data.building.address ?? BUILDING_ADDRESS}</Text>
          </View>
          {/* No invoice number exists yet: the draft marking takes its place. */}
          <View style={styles.documentMeta}>
            <Text style={styles.headerMeta}>Aviso de pago</Text>
            <Text style={styles.draftLabel}>{DRAFT_LABEL}</Text>
            <Text style={styles.periodLabel}>{period}</Text>
          </View>
        </View>

        <View style={styles.owner}>
          <Text style={styles.ownerName}>{data.owner.name}</Text>
          <Text style={styles.ownerUnits}>{compactUnitList(data.units)}</Text>
        </View>

        <View style={styles.total} wrap={false}>
          <View style={{ flex: 1, paddingRight: 24 }}>
            <Text style={styles.totalLabel}>Total a pagar</Text>
            <Text style={styles.totalNote}>Cargos de {monthLabel(data.obligationMonth)}. No incluye saldos anteriores.</Text>
          </View>
          <Text style={styles.totalAmount}>
            <Text style={styles.totalCurrency}>S/ </Text>
            {formatAmount(data.currentTotal)}
          </Text>
        </View>

        <View style={styles.detailHeader} minPresenceAhead={60}>
          <Text>Detalle de cargos</Text>
          <Text>Importe</Text>
        </View>
        {GROUPS.map((group) => {
          const groupRows = rows.filter((row) => group.kinds.includes(row.line.kind));
          if (groupRows.length === 0) return null;
          return (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle} minPresenceAhead={30}>
                {group.title}
              </Text>
              {groupRows.map((row) => (
                <ChargeRow key={row.key} row={row} />
              ))}
            </View>
          );
        })}
        <View style={styles.detailEnd} />

        <View style={styles.payment} wrap={false}>
          {PAYMENT_DETAILS.map(([label, value]) => (
            <View key={label} style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>{label}</Text>
              <Text style={styles.paymentValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>Vista previa generada el {generated} · {DRAFT_LABEL}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
