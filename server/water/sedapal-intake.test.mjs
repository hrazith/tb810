import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import createJiti from "jiti";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260923120000_sedapal_live_intake.sql", import.meta.url),
  "utf8",
);
const service = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const { commonWaterBillInputSchema } = jiti("./validation.ts");

const validInput = {
  bill_date: "2026-08-31",
  previous_reading: "0.000",
  current_reading: "10.000",
  amount: "208.00",
  source_pdf: {
    name: "sedapal.pdf",
    type: "application/pdf",
    size: 5,
    arrayBuffer: async () => new TextEncoder().encode("%PDF-").buffer,
  },
  description: "",
  notes: "",
};

test("native Sedapal intake requires a source PDF", () => {
  assert.equal(commonWaterBillInputSchema.safeParse(validInput).success, true);
  const withoutPdf = { ...validInput, source_pdf: undefined };
  assert.equal(commonWaterBillInputSchema.safeParse(withoutPdf).success, false);
});

test("native Sedapal intake preserves reading validation", () => {
  const invalid = { ...validInput, current_reading: "-1.000" };
  assert.equal(commonWaterBillInputSchema.safeParse(invalid).success, false);
});

test("native duplicate protection excludes imported historical utilities", () => {
  assert.match(migration, /tb810_native_common_water_bill_period_uidx/);
  assert.match(migration, /legacy_table is distinct from %L/);
  assert.match(service, /legacy_table\.is\.null,legacy_table\.neq\.utilities/);
});

test("bill and source document persistence share one transaction RPC", () => {
  assert.match(migration, /tb810_create_common_water_bill_with_document/);
  assert.match(
    migration,
    /insert into public\.tb810_utility_bills[\s\S]*insert into public\.tb810_documents/,
  );
  assert.match(service, /tb810_create_common_water_bill_with_document/);
  assert.match(service, /storage[\s\S]*remove\(\[storagePath\]\)/);
});

test("source PDFs are checked before the transaction RPC", () => {
  assert.match(service, /sourcePdf\.type !== "application\/pdf"/);
  assert.match(service, /sourcePdf\.size <= 0 \|\| sourcePdf\.size > MAX_SEDAPAL_SOURCE_PDF_BYTES/);
  assert.match(service, /pdfSignature !== "%PDF-"/);
  assert.ok(
    service.indexOf("pdfSignature !== \"%PDF-\"") <
      service.indexOf('"tb810_create_common_water_bill_with_document"'),
  );
});

test("historical documents remain optional while native documents are linked", () => {
  assert.match(service, /This historical bill has no source PDF/);
  assert.match(migration, /utility_bill_id/);
  assert.match(migration, /tb810-sedapal-source-pdfs/);
});
