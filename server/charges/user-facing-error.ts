const SAFE_CHARGE_ERROR_PREFIXES = [
  "Amount must be",
  "A handed-off charge must",
  "Charge target",
  "Charge schedule",
  "Current building",
  "Description is required",
  "End month",
  "Future charges only",
  "Invalid start month",
  "Invalid end month",
  "No applicable charge targets",
  "One-off charges",
  "Only recurring charges",
  "Owner is not currently",
  "Owner is required",
  "Owner not found",
  "Start month",
  "Stop month",
  "Unit is required",
  "Unit not found",
  "You are not authorized",
];

export function userFacingChargeError(error: string) {
  return SAFE_CHARGE_ERROR_PREFIXES.some((prefix) => error.startsWith(prefix))
    ? error
    : "Unable to save this charge. Please try again.";
}
