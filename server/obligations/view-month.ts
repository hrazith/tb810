// The Obligations page shows the current calendar month (America/Lima) unless
// a month is explicitly requested. Package lifecycle state (approval, handoff,
// dispatch) never moves the viewed month.

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseRequestedObligationMonth(value: string | undefined) {
  return value && MONTH_KEY_PATTERN.test(value) ? value : null;
}

export function selectObligationsViewMonth({
  requestedMonth,
  calendarMonth,
}: {
  requestedMonth: string | undefined;
  calendarMonth: string;
}) {
  return parseRequestedObligationMonth(requestedMonth) ?? calendarMonth;
}
