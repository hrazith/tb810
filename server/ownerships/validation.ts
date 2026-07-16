import { z } from "zod";

export const ownershipTransferSchema = z.object({
  unit_id: z.string().uuid("Please select a valid Unit."),
  owner_id: z
    .string()
    .trim()
    .min(1, "Please select an Owner.")
    .uuid("Please select a valid Owner."),
  effective_date: z
    .string()
    .trim()
    .min(1, "Please choose an effective billing date.")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Please select a valid date.")
    .refine((value) => new Date(`${value}T00:00:00Z`).getUTCDate() === 1, {
      message: "Effective billing date must be the first day of a month.",
    }),
  notes: z.preprocess(
    (value) => {
      if (value === undefined || value === "") {
        return null;
      }
      return value;
    },
    z
      .string()
      .trim()
      .max(2000, "Must be 2000 characters or fewer")
      .nullable(),
  ),
});

export type OwnershipTransferInput = z.infer<typeof ownershipTransferSchema>;

export function firstDayOfNextMonth(from = new Date()) {
  const date = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1),
  );
  return date.toISOString().slice(0, 10);
}

export function mapOwnershipTransferError(message: string) {
  if (message.includes("Please select an Owner")) {
    return "Please select an Owner.";
  }
  if (message.includes("Please choose an effective billing date")) {
    return "Please choose an effective billing date.";
  }
  if (message.includes("Please select a valid date")) {
    return "Please choose a valid effective billing date.";
  }
  if (message.includes("first day of a month")) {
    return "Effective billing date must be the first day of a month.";
  }
  if (message.includes("Incoming owner matches the current owner")) {
    return "This Owner is already responsible for the Unit.";
  }
  if (message.includes("Incoming owner is inactive")) {
    return "The selected Owner is inactive and cannot be assigned.";
  }
  if (message.includes("Unit account for unit")) {
    return "This unit does not have an active Unit Account.";
  }
  if (message.includes("Not authorized")) {
    return "You do not have permission to assign or transfer Ownership.";
  }
  if (
    message.includes("tb810_ownerships_no_overlapping_periods") ||
    message.includes("conflicting key value violates exclusion constraint") ||
    message.includes("overlap")
  ) {
    return "This assignment overlaps an existing Ownership period.";
  }
  if (message.includes("tb810_ownerships_one_open_per_unit_idx")) {
    return "That unit already has an open ownership record.";
  }
  return "We could not complete the Ownership assignment. Please try again.";
}
