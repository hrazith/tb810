import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import { inflateSync } from "node:zlib";
import ts from "typescript";

// Renders the AVISO DE PAGO with the real react-pdf renderer and Gotham fonts,
// then reads each page's text back from the PDF (decompressed content streams
// decoded through each font's ToUnicode map). Each JSX text child is its own
// run, so labels with interpolated values are matched on the joined page text.
const root = process.cwd();

function loadModule(file) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    // Read before caching so a failed extension probe never leaves an empty module.
    const source = readFileSync(filename, "utf8");
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const nativeRequire = createRequire(filename);
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    function require(specifier) {
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const target = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        for (const suffix of [".ts", ".tsx", "/index.ts"]) {
          try { return load(target + suffix); } catch (error) { if (error.code !== "ENOENT") throw error; }
        }
        throw new Error(`Unresolved module: ${specifier}`);
      }
      return nativeRequire(specifier);
    }
    runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, loaded, loaded.exports);
    return loaded.exports;
  }
  return load(path.join(root, file));
}

const { renderOwnerAvisoPdf, ownerAvisoFilename } = loadModule("server/invoices/owner-aviso-pdf.ts");

function readPdf(buffer) {
  const source = buffer.toString("latin1");
  const objects = new Map();
  for (const match of source.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const body = match[2];
    const streamAt = body.indexOf("stream");
    const dict = streamAt === -1 ? body : body.slice(0, streamAt);
    let stream = null;
    if (streamAt !== -1) {
      const start = match.index + match[0].indexOf("stream") + "stream\n".length;
      const raw = buffer.subarray(start, start + Number(/\/Length (\d+)/.exec(dict)[1]));
      stream = (/FlateDecode/.test(dict) ? inflateSync(raw) : raw).toString("latin1");
    }
    objects.set(match[1], { dict, stream });
  }
  const ref = (dict, key) => new RegExp(`/${key} (\\d+) 0 R`).exec(dict)?.[1];
  const toUnicode = (fontId) => {
    const map = new Map();
    for (const [, code, text] of objects.get(ref(objects.get(fontId).dict, "ToUnicode")).stream.matchAll(/<([0-9a-f]{4})><([0-9a-f ]+)>/gi)) {
      map.set(code, String.fromCodePoint(...text.split(" ").map((hex) => parseInt(hex, 16))));
    }
    return map;
  };
  const pagesDict = [...objects.values()].find((object) => /\/Type \/Pages\b/.test(object.dict)).dict;
  const pageIds = [.../\/Kids \[([^\]]*)\]/.exec(pagesDict)[1].matchAll(/(\d+) 0 R/g)].map((match) => match[1]);
  const pages = pageIds.map((pageId) => {
    const page = objects.get(pageId).dict;
    const resources = objects.get(ref(page, "Resources"))?.dict ?? page;
    const fonts = new Map([.../\/Font <<([^>]*)>>/.exec(resources)[1].matchAll(/\/(\w+) (\d+) 0 R/g)].map(([, name, id]) => [name, toUnicode(id)]));
    const runs = [];
    let font = null;
    for (const [, name, array] of objects.get(ref(page, "Contents")).stream.matchAll(/\/(\w+) [\d.]+ Tf|\[([^\]]*)\] TJ/g)) {
      if (name) font = fonts.get(name);
      else runs.push([...array.matchAll(/<([0-9a-f]*)>/gi)].map(([, hex]) => hex.match(/.{4}/g)?.map((code) => font.get(code) ?? "�").join("") ?? "").join(""));
    }
    return runs;
  });
  const baseFonts = [...new Set([...source.matchAll(/\/BaseFont \/([\w+-]+)/g)].map((match) => match[1].replace(/^[A-Z]{6}\+/, "")))].sort();
  return { pages, baseFonts };
}

const fixed = (amount) => ({ kind: "fixed", label: "Cuota de mantenimiento", amount });
const water = (consumption, amount) => ({ kind: "water", label: "Agua", amount, usage: { consumption, rate: "5.000000", periodLabel: "lecturas de setiembre de 2026" } });
const commonWater = (amount) => ({ kind: "common_water", label: "Agua común (Sedapal)", amount });
const gas = (consumption, amount) => ({ kind: "gas", label: "Gas", amount, usage: { consumption, rate: "19.411765", periodLabel: "consumo de setiembre de 2026" } });
const other = (label, amount) => ({ kind: "other", label, amount });
const unit = (unitNumber, unitTypeCode, lines) => ({
  unitNumber, unitTypeCode, lines, subtotal: (lines.reduce((sum, line) => sum + Math.round(Number(line.amount) * 100), 0) / 100).toFixed(2),
});

// Shapes taken from the October 2026 local dataset (scenarios A and E).
const ownerA = {
  obligationMonth: "2026-10",
  owner: { name: "Ana Lucía Quispe Ficticia", reference: "OWN-000001" },
  building: { address: null },
  packageStatus: null,
  units: [unit("304", "condo", [fixed("1400.00"), water("16.000", "80.00"), commonWater("33.00"), gas("2.400", "46.59"), other("Reposición de tarjeta de acceso", "25.00")])],
  ownerDirect: { lines: [other("Constancia de no adeudo", "20.00")], total: "20.00" },
  currentTotal: "1604.59",
};

const ownerE = {
  obligationMonth: "2026-10",
  owner: { name: "María del Pilar Echegaray Ñúñez de Arámburu y Fernández-Concha Ficticia", reference: "OWN-000005" },
  building: { address: null },
  packageStatus: null,
  units: [
    unit("1402", "condo", [fixed("1400.00"), water("27.000", "135.00"), commonWater("33.00"), gas("5.500", "106.76"), other("Reparación de filtración en baño principal, incluye materiales, mano de obra y retiro de desmonte (acuerdo de Junta Nº 14)", "480.00")]),
    unit("E-30", "parking", [fixed("300.00")]),
    unit("E-31", "parking", [fixed("300.00"), other("Alquiler de punto de carga para vehículo eléctrico", "45.00")]),
    unit("E-32", "parking", [fixed("300.00")]),
    unit("D-15", "storage", [fixed("225.00")]),
    unit("D-16", "storage", [fixed("225.00"), other("Retiro de enseres del depósito", "40.00")]),
  ],
  ownerDirect: { lines: [other("Copias certificadas del acta de Junta", "45.00"), other("Constancia de no adeudo", "20.00")], total: "65.00" },
  currentTotal: "3654.76",
};

// Twice the largest realistic Owner, with long labels on every fourth Unit.
function stress() {
  const types = ["condo", "parking", "storage"];
  const longLabel = "Reparación extraordinaria de la tubería de desagüe comunal del sótano, incluye mano de obra, materiales y retiro de desmonte (acuerdo de Junta Nº 14)";
  const units = Array.from({ length: 12 }, (_, index) => unit(String(101 + index), types[index % 3], [
    fixed("1300.00"),
    ...(types[index % 3] === "condo" ? [water("18.000", "90.00"), commonWater("33.00"), gas("1.500", "29.12")] : []),
    ...(index % 4 === 0 ? [other(longLabel, "12345.67")] : []),
  ]));
  return {
    obligationMonth: "2026-10",
    owner: { name: "María José Peñaloza Ñúñez de Arámburu y Fernández-Concha Sociedad Conyugal con Representación Legal Inscrita", reference: "OWN-000999" },
    building: { address: "Av. Ejemplo 810, Miraflores, Lima" },
    packageStatus: null,
    units,
    ownerDirect: { lines: [other("Copias certificadas del acta — ¿urgente? ¡Sí!", "45.00")], total: "45.00" },
    currentTotal: "54444.37",
  };
}

const GROUP_TITLES = ["Cuotas fijas", "Agua", "Gas", "Otros cargos"];
const generatedAt = new Date("2026-10-13T15:00:00Z");
// The grand total is a small "S/" run followed by the large amount run.
const currencyAmounts = (runs) => runs.flatMap((text, index) => (text.includes("S/") ? [`${text}${runs[index + 1] ?? ""}`] : []));

test("filename is deterministic from month and Owner reference", () => {
  assert.equal(ownerAvisoFilename({ obligationMonth: "2026-10", owner: { name: "x", reference: "OWN-000001" } }), "TB810-2026-10-OWN-000001.pdf");
});

test("single-Unit aviso fits one page with Gotham, the draft marking and a current-period-only grand total", async () => {
  const { pages, baseFonts } = readPdf(await renderOwnerAvisoPdf(ownerA, generatedAt));
  assert.equal(pages.length, 1);
  assert.deepEqual(baseFonts, ["GothamBold", "GothamBook", "GothamMedium"]);
  const runs = pages[0];
  for (const text of ["Edificio Torre Balta", "Junta de Propietarios", "Aviso de pago", "Octubre de 2026", "BORRADOR — NO EMITIDO", "Ana Lucía Quispe Ficticia", "Departamento 304", "Total a pagar", "Página 1 de 1"]) {
    assert.ok(runs.includes(text), `missing "${text}"`);
  }
  // The currency appears once, on the grand total; there are no subtotals.
  assert.deepEqual(currencyAmounts(runs), ["S/ 1,604.59"]);
  const page = runs.join("");
  assert.doesNotMatch(page, /Subtotal|RESUMEN|Saldo anterior/);
  // Prior balances are never shown, as zero or otherwise; the total says so.
  assert.match(page, /Cargos de octubre de 2026\. No incluye saldos anteriores\./);
  assert.doesNotMatch(page, /\b0\.00\b/);
  assert.match(page, /Malecón Balta 810 · Miraflores, Lima/);
  // No payment instructions are printed until they are verified.
  assert.match(page, /Datos bancariosPendientes de confirmación/);
  assert.doesNotMatch(page, /INTERBANK|Beneficiario|Nº Cta|CCI|\d{3}-\d{3}-\d{9,}/);
});

test("each charge is one plain line naming its Unit or the Owner, with no gray detail text", async () => {
  const runs = readPdf(await renderOwnerAvisoPdf(ownerA, generatedAt)).pages[0];
  const rows = [
    ["Departamento 304", "1,400.00"],
    ["Departamento 304 · Consumo", "80.00"],
    ["Departamento 304 · Agua común", "33.00"],
    ["Departamento 304", "46.59"],
    ["Departamento 304 · Reposición de tarjeta de acceso", "25.00"],
    ["Propietario · Constancia de no adeudo", "20.00"],
  ];
  for (const [title, amount] of rows) {
    const at = runs.findIndex((text, index) => text === title && runs[index + 1] === amount);
    assert.ok(at >= 0, `missing row "${title}" ${amount}`);
  }
  // Consumption and rate details are no longer printed.
  assert.doesNotMatch(runs.join(""), /Tarifa|Consumo \d|lecturas de|consumo de|Agua común \(Sedapal\)|Cargo directo/);
  assert.doesNotMatch(runs.join(""), /[×³�]/);
});

test("six-Unit aviso fits one page with every charge grouped and attributed", async () => {
  const { pages } = readPdf(await renderOwnerAvisoPdf(ownerE, generatedAt));
  assert.equal(pages.length, 1);
  const all = pages[0];
  assert.ok(all.includes("Página 1 de 1"));
  assert.deepEqual(currencyAmounts(all), ["S/ 3,654.76"]);
  assert.ok(!all.includes("Subtotal"));
  assert.deepEqual(all.filter((text) => GROUP_TITLES.includes(text)), GROUP_TITLES);
  assert.ok(all.join("").includes("Departamento 1402 · Estacionamientos E-30, E-31, E-32 · Depósitos D-15, D-16"));
  // Fixed fees name every Unit, in order.
  const fixedSection = all.slice(all.indexOf("Cuotas fijas") + 1, all.indexOf("Agua"));
  assert.deepEqual(fixedSection.filter((_, index) => index % 2 === 0), ["Departamento 1402", "Estacionamiento E-30", "Estacionamiento E-31", "Estacionamiento E-32", "Depósito D-15", "Depósito D-16"]);
  for (const title of [
    "Estacionamiento E-31 · Alquiler de punto de carga para vehículo eléctrico",
    "Depósito D-16 · Retiro de enseres del depósito",
    "Propietario · Copias certificadas del acta de Junta",
    "Propietario · Constancia de no adeudo",
  ]) assert.ok(all.includes(title), `missing "${title}"`);
});

test("twelve-Unit aviso paginates, repeats the Owner/month context and keeps labels to two lines", async () => {
  const data = stress();
  const { pages, baseFonts } = readPdf(await renderOwnerAvisoPdf(data, generatedAt));
  assert.ok(pages.length >= 2, `expected pagination, got ${pages.length} page(s)`);
  assert.deepEqual(baseFonts, ["GothamBold", "GothamBook", "GothamMedium"]);
  pages.forEach((runs, index) => {
    assert.ok(runs.includes("BORRADOR — NO EMITIDO"));
    assert.ok(runs.includes(`Página ${index + 1} de ${pages.length}`));
    if (index > 0) assert.match(runs.join(""), /^AVISO DE PAGO · Octubre de 2026BORRADOR — NO EMITIDOOWN-000999 · María José/);
    // A long charge is cut to two lines ending in an ellipsis, kept with its amount.
    runs.forEach((text, at) => {
      if (!/· Reparación extraordinaria/.test(text)) return;
      assert.ok(runs[at + 1].endsWith("…"), `long label not truncated on page ${index + 1}`);
      assert.equal(runs[at + 2], "12,345.67", `long charge split on page ${index + 1}`);
    });
  });
  const all = pages.flat();
  assert.equal(all.filter((text) => text === "12,345.67").length, 3);
  assert.equal(all.filter((text) => text === "1,300.00").length, 12);
  assert.ok(!all.join("").includes("(acuerdo de Junta Nº 14)"), "text beyond two lines is not printed");
  assert.deepEqual(currencyAmounts(all), ["S/ 54,444.37"]);
  assert.match(all.join("\n"), /¿urgente\? ¡Sí!/);
  assert.doesNotMatch(all.join("\n"), /�/);
});

test("amounts are printed exactly as provided, never recalculated", async () => {
  const data = structuredClone(ownerA);
  data.units[0].lines[0].amount = "1234567.89";
  data.units[0].subtotal = "0.01";
  data.currentTotal = "98765.43";
  const runs = readPdf(await renderOwnerAvisoPdf(data, generatedAt)).pages[0];
  assert.ok(runs.includes("1,234,567.89"));
  assert.deepEqual(currencyAmounts(runs), ["S/ 98,765.43"]);
  assert.ok(!runs.includes("0.01"), "Unit subtotals are not rendered");
});
