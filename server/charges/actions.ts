"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createOwnerDirectCharge,
  createUnitCharge,
  deleteFutureCharge,
  editFutureCharge,
  changeFutureChargeEconomics,
  stopFutureCharge,
} from "./index";
import {
  chargeEconomicsSchema,
  chargeInputSchema,
  chargeStopSchema,
  futureChargeDeleteSchema,
  futureChargeEditSchema,
  ownerChargeInputSchema,
} from "./validation";

function redirectWithError(returnTo: string, message: string) {
  const url = new URL(returnTo, "http://localhost");
  url.searchParams.set("error", message);
  redirect(url.pathname + url.search);
}

function redirectBack(returnTo: string) {
  redirect(returnTo);
}

function parseNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function pickString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function validationError(e: z.ZodError) {
  return e.issues[0]?.message ?? "Invalid input.";
}

export async function createUnitChargeAction(formData: FormData): Promise<void> {
  const returnTo = pickString(formData, "return_to") || "/obligations";
  const parsed = chargeInputSchema.safeParse({
    unit_id: pickString(formData, "unit_id"),
    description: pickString(formData, "description"),
    amount: parseNumber(formData.get("amount")),
    schedule: pickString(formData, "schedule"),
    starts_month: pickString(formData, "starts_month"),
    ends_month: pickString(formData, "ends_month"),
  });
  if (!parsed.success) {
    redirectWithError(returnTo, validationError(parsed.error));
    return;
  }
  const result = await createUnitCharge(parsed.data);
  if (result.error) redirectWithError(returnTo, result.error);
  redirectBack(returnTo);
}

export async function createOwnerDirectChargeAction(formData: FormData): Promise<void> {
  const returnTo = pickString(formData, "return_to") || "/obligations";
  const parsed = ownerChargeInputSchema.safeParse({
    owner_id: pickString(formData, "owner_id"),
    description: pickString(formData, "description"),
    amount: parseNumber(formData.get("amount")),
    schedule: pickString(formData, "schedule"),
    starts_month: pickString(formData, "starts_month"),
    ends_month: pickString(formData, "ends_month"),
  });
  if (!parsed.success) {
    redirectWithError(returnTo, validationError(parsed.error));
    return;
  }
  const result = await createOwnerDirectCharge(parsed.data);
  if (result.error) redirectWithError(returnTo, result.error);
  redirectBack(returnTo);
}

export async function changeFutureChargeEconomicsAction(formData: FormData): Promise<void> {
  const returnTo = pickString(formData, "return_to") || "/obligations";
  const chargeId = pickString(formData, "charge_id");
  const parsed = chargeEconomicsSchema.safeParse({
    amount: parseNumber(formData.get("amount")),
    effective_month: pickString(formData, "effective_month"),
  });
  if (!parsed.success) {
    redirectWithError(returnTo, validationError(parsed.error));
    return;
  }
  const result = await changeFutureChargeEconomics(chargeId, parsed.data);
  if (result.error) redirectWithError(returnTo, result.error);
  redirectBack(returnTo);
}

export async function editFutureChargeAction(formData: FormData): Promise<void> {
  const returnTo = pickString(formData, "return_to") || "/obligations";
  const parsed = futureChargeEditSchema.safeParse({
    charge_id: pickString(formData, "charge_id"),
    description: pickString(formData, "description"),
    amount: parseNumber(formData.get("amount")),
    schedule: pickString(formData, "schedule"),
    starts_month: pickString(formData, "starts_month"),
    ends_month: pickString(formData, "ends_month"),
  });
  if (!parsed.success) {
    redirectWithError(returnTo, validationError(parsed.error));
    return;
  }
  const { charge_id, ...input } = parsed.data;
  const result = await editFutureCharge(charge_id, input);
  if (result.error) redirectWithError(returnTo, result.error);
  redirectBack(returnTo);
}

export async function deleteFutureChargeAction(formData: FormData): Promise<void> {
  const returnTo = pickString(formData, "return_to") || "/obligations";
  const parsed = futureChargeDeleteSchema.safeParse({
    charge_id: pickString(formData, "charge_id"),
  });
  if (!parsed.success) {
    redirectWithError(returnTo, validationError(parsed.error));
    return;
  }
  const result = await deleteFutureCharge(parsed.data.charge_id);
  if (result.error) redirectWithError(returnTo, result.error);
  redirectBack(returnTo);
}

export async function stopFutureChargeAction(formData: FormData): Promise<void> {
  const returnTo = pickString(formData, "return_to") || "/obligations";
  const chargeId = pickString(formData, "charge_id");
  const parsed = chargeStopSchema.safeParse({
    stop_month: pickString(formData, "stop_month"),
    note: pickString(formData, "note"),
  });
  if (!parsed.success) {
    redirectWithError(returnTo, validationError(parsed.error));
    return;
  }
  const result = await stopFutureCharge(chargeId, parsed.data);
  if (result.error) redirectWithError(returnTo, result.error);
  redirectBack(returnTo);
}
