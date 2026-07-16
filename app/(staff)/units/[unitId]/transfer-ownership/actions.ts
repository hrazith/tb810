"use server";

import { redirect } from "next/navigation";

import { transferOwnership } from "@/server/ownerships";
import type { OwnershipTransferInput } from "@/server/ownerships/types";
import { ownershipTransferSchema } from "@/server/ownerships/validation";

type TransferFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof OwnershipTransferInput, string>>;
  values?: OwnershipTransferInput;
};

function toInput(unitId: string, formData: FormData): OwnershipTransferInput {
  return {
    unit_id: unitId,
    owner_id: String(formData.get("owner_id") ?? ""),
    effective_date: String(formData.get("effective_date") ?? ""),
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

export async function transferOwnershipAction(
  unitId: string,
  _prev: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  try {
    const values = toInput(unitId, formData);
    const validation = ownershipTransferSchema.safeParse(values);

    if (!validation.success) {
      console.error("Ownership transfer validation failed", {
        unitId,
        issues: validation.error.issues,
        format: validation.error.format(),
      });
      return {
        fieldErrors: mapFieldErrors(validation.error.issues),
        error: validation.error.issues.map((issue) => issue.message).join("; "),
        values,
      };
    }

    const result = await transferOwnership(validation.data);

    if (result.error) {
      return { error: result.error, values };
    }

    redirect(`/units/${unitId}`);
  } catch (error) {
    console.error("Ownership transfer action exception", {
      unitId,
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
