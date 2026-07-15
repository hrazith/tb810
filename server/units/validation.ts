import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(2000, "Must be 2000 characters or fewer")
  .optional()
  .or(z.literal(""));

export const unitInputSchema = z.object({
  building_id: z.string().trim().min(1, "Building is required"),
  unit_type_id: z.string().trim().min(1, "Type is required"),
  unit_number: z.string().trim().min(1, "Unit number is required"),
  floor: z
    .string()
    .trim()
    .max(255, "Must be 255 characters or fewer")
    .optional()
    .or(z.literal(""))
    .transform((value) => {
      if (!value) return null;
      return value.trim();
    }),
  registered_area_m2: z.union([
    z
      .number()
      .min(0, "Registered area must be non-negative")
      .max(99999.999, "Registered area is too large")
      .optional(),
    z.null(),
  ]),
  participation_percentage: z
    .number()
    .min(0, "Participation percentage must be non-negative")
    .max(100, "Participation percentage must not exceed 100"),
  has_meter: z.boolean(),
  notes: optionalText.transform((value) => {
    if (!value) return null;
    return value.trim();
  }),
});

export type UnitInputSchema = z.infer<typeof unitInputSchema>;

export const unitArchiveSchema = z.object({
  active: z.boolean(),
});
