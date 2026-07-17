import { z } from "zod";

function currentBillingMonth(from = new Date()) {
  return from.toISOString().slice(0, 7);
}

function normalizeBillingMonth(month: string) {
  return `${month}-01`;
}

const billingEffectiveMonthSchema = z.preprocess(
  (value) => (value === undefined || value === "" ? undefined : value),
  z
    .string({ error: "Please choose a billing-effective month." })
    .trim()
    .min(1, "Please choose a billing-effective month.")
    .regex(
      /^\d{4}-(0[1-9]|1[0-2])$/,
      "Please choose a valid billing-effective month.",
    )
    .refine((value) => value >= currentBillingMonth(), {
      message: "Billing responsibility cannot begin in a past month.",
    }),
);

export const ownershipTransferSchema = z
  .object({
    unit_id: z.string().uuid("Please select a valid Unit."),
    owner_id: z
      .string()
      .trim()
      .min(1, "Please select an Owner.")
      .uuid("Please select a valid Owner."),
    effective_month: billingEffectiveMonthSchema,
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
  })
  .transform((value) => ({
    ...value,
    effective_date: normalizeBillingMonth(value.effective_month),
  }));

export type OwnershipTransferFormInput = z.input<typeof ownershipTransferSchema>;
export type OwnershipTransferInput = z.output<typeof ownershipTransferSchema>;

export function getCurrentBillingMonth(from = new Date()) {
  return currentBillingMonth(from);
}

export function mapOwnershipTransferError(message: string) {
  if (message.includes("Please select an Owner")) {
    return "Please select an Owner.";
  }
  if (message.includes("Please choose a billing-effective month")) {
    return "Please choose a billing-effective month.";
  }
  if (message.includes("Please choose a valid billing-effective month")) {
    return "Please choose a valid billing-effective month.";
  }
  if (message.includes("Billing responsibility cannot begin in a past month")) {
    return "Billing responsibility cannot begin in a past month.";
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
    return "This billing month overlaps an existing Ownership period.";
  }
  if (message.includes("tb810_ownerships_one_open_per_unit_idx")) {
    return "That unit already has an open ownership record.";
  }
  return "We could not complete the Ownership assignment. Please try again.";
}
