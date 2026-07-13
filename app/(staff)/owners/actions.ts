"use server";

import { redirect } from "next/navigation";

import { archiveOwner, createOwner, updateOwner } from "@/server/owners";
import type { OwnerFormState } from "@/server/owners/types";
import { ownerInputSchema } from "@/server/owners/validation";

function toOwnerInput(formData: FormData) {
  return {
    full_name: String(formData.get("full_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone_number: String(formData.get("phone_number") ?? ""),
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
  values: ReturnType<typeof toOwnerInput>,
): OwnerFormState {
  return { error: message, values };
}

export async function createOwnerAction(
  _prev: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const values = toOwnerInput(formData);
  const validation = ownerInputSchema.safeParse(values);

  if (!validation.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: mapFieldErrors(validation.error.issues),
      values,
    };
  }

  const result = await createOwner(validation.data);

  if (result.error) {
    return toFormStateError(result.error, values);
  }

  redirect(`/owners/${result.data.id}`);
}

export async function updateOwnerAction(
  ownerId: string,
  _prev: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const values = toOwnerInput(formData);
  const validation = ownerInputSchema.safeParse(values);

  if (!validation.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: mapFieldErrors(validation.error.issues),
      values,
    };
  }

  const result = await updateOwner(ownerId, validation.data);

  if (result.error) {
    return toFormStateError(result.error, values);
  }

  redirect(`/owners/${ownerId}`);
}

export async function archiveOwnerAction(ownerId: string): Promise<void> {
  const result = await archiveOwner(ownerId);
  if (result.error) {
    throw new Error(result.error);
  }

  redirect(`/owners/${ownerId}`);
}
