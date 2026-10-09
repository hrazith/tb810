export const UNIT_AUTHORIZATION_ERROR = "You are not authorized to manage Units.";
export const UNIT_REASON_REQUIRED_ERROR = "A reason for change is required.";

export function userFacingUnitWriteError(message: string) {
  if (message === UNIT_AUTHORIZATION_ERROR || message === UNIT_REASON_REQUIRED_ERROR) return message;
  // An RLS refusal surfaces as a policy violation (insert) or zero rows (update).
  if (/row-level security|Cannot coerce the result to a single JSON object|permission denied/i.test(message)) {
    return UNIT_AUTHORIZATION_ERROR;
  }
  if (/tb810_units_building_id_unit_number_key/.test(message)) return "Unit number already exists.";
  return message;
}
