"use server";

import { redirect } from "next/navigation";

import { updateUnit } from "@/server/units";
import type { UnitFormState } from "@/server/units/types";
import { unitInputSchema } from "@/server/units/validation";

function toUnitInput(formData: FormData) {
  return {
    building_id: String(formData.get("building_id") ?? ""),
    unit_type_id: String(formData.get("unit_type_id") ?? ""),
    unit_number: String(formData.get("unit_number") ?? ""),
    floor: String(formData.get("floor") ?? ""),
    registered_area_m2: (() => {
      const raw = String(formData.get("registered_area_m2") ?? "").trim();
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    })(),
    participation_percentage: (() => {
      const raw = String(formData.get("participation_percentage") ?? "").trim();
      if (!raw) return Number.NaN;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    })(),
    has_meter: String(formData.get("has_meter") ?? "no") === "yes",
    notes: String(formData.get("notes") ?? ""),
  };
}

function mapFieldErrors(
  issues: Array<{ path: ReadonlyArray<PropertyKey>; message: string }>,
) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

function toFormStateError(
  message: string,
  values: ReturnType<typeof toUnitInput>,
): UnitFormState {
  return { error: message, values };
}

export async function updateUnitAction(
  unitId: string,
  _prev: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const values = toUnitInput(formData);
  const validation = unitInputSchema.safeParse(values);
  if (!validation.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: mapFieldErrors(validation.error.issues),
      values,
    };
  }

  const result = await updateUnit(unitId, validation.data);
  if (result.error) return toFormStateError(result.error, values);

  redirect(`/units/${unitId}`);
}
