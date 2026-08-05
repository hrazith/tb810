const createJiti = require("jiti");

const jiti = createJiti(__filename);
const { getMonthlyObligation } = jiti("../server/obligations");

function formatMoney(value) {
  if (value === null || value === undefined) return "—";
  return String(value);
}

function countBy(list, key) {
  return list.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] ?? 0) + 1;
    return acc;
  }, {});
}

function componentSummary(components) {
  return components.reduce(
    (acc, component) => {
      if (component.status === "available" && component.amount) {
        acc.totals[component.key] = acc.totals[component.key] ?? "0.00";
        const [wholeA, fracA] = acc.totals[component.key].split(".");
        const [wholeB, fracB] = component.amount.split(".");
        const sum =
          Number(`${wholeA}.${fracA}`) + Number(`${wholeB}.${fracB}`);
        acc.totals[component.key] = sum.toFixed(2);
      }
      return acc;
    },
    { totals: {} },
  ).totals;
}

function printUnit(unit) {
  console.log(`Unit ${unit.unitNumber}`);
  console.log(`  unit account ID: ${unit.unitAccountId}`);
  console.log(`  known total: ${formatMoney(unit.knownTotal)}`);
  console.log(`  readiness: ${unit.readiness}`);
  for (const component of unit.components) {
    console.log(`  component ${component.key}`);
    console.log(`    status: ${component.status}`);
    console.log(`    amount: ${formatMoney(component.amount)}`);
    console.log(`    currency: ${component.currency ?? "—"}`);
    console.log(`    source month: ${component.sourceMonth ?? "—"}`);
    console.log(`    blocker: ${component.blocker ?? "—"}`);
  }
}

(async () => {
  const result = await getMonthlyObligation({ obligationMonth: "2026-08" });
  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }

  const obligation = result.data;
  const unitsByNumber = new Map(obligation.units.map((unit) => [unit.unitNumber, unit]));
  const targetUnits = ["201", "202", "404"].map((unitNumber) => unitsByNumber.get(unitNumber)).filter(Boolean);
  const componentTotals = componentSummary(
    obligation.units.flatMap((unit) => unit.components),
  );
  const missingCounts = countBy(
    obligation.units.flatMap((unit) => unit.components.filter((component) => component.status === "missing")),
    "key",
  );
  const blockerCounts = countBy(
    obligation.units.flatMap((unit) => unit.components.filter((component) => component.blocker)),
    "key",
  );

  console.log(`Building: ${obligation.buildingName} (${obligation.buildingId})`);
  console.log(`Obligation month: ${obligation.obligationMonth}`);
  console.log(`Total unit obligations returned: ${obligation.units.length}`);
  console.log(`Overall readiness: ${obligation.readiness}`);
  console.log(`Overall known total: ${formatMoney(obligation.knownTotal)}`);
  console.log(`Missing component counts: ${JSON.stringify(missingCounts)}`);
  console.log(`Blocker counts: ${JSON.stringify(blockerCounts)}`);
  console.log(`Totals by component: ${JSON.stringify(componentTotals)}`);
  console.log("");

  for (const unit of targetUnits) {
    printUnit(unit);
    console.log("");
  }
})().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});

