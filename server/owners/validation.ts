import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .optional()
  .or(z.literal(""));

const optionalText = z
  .string()
  .trim()
  .max(255, "Must be 255 characters or fewer")
  .optional()
  .or(z.literal(""));

export const ownerInputSchema = z.object({
  full_name: z.string().trim().min(1, "Owner name is required"),
  email: emailSchema.transform((value) => {
    if (!value) return null;
    return value.trim();
  }),
  phone_number: optionalText.transform((value) => {
    if (!value) return null;
    return value.trim();
  }),
  notes: z
    .string()
    .trim()
    .max(2000, "Must be 2000 characters or fewer")
    .optional()
    .or(z.literal(""))
    .transform((value) => {
      if (!value) return null;
      return value.trim();
    }),
});

export type OwnerInputSchema = z.infer<typeof ownerInputSchema>;
