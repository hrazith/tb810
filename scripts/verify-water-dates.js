import {
  formatMonthYear,
  getChargeMonthFromServiceMonth,
  getServiceMonthFromReadingDate,
} from "../lib/water-dates.ts";

function assertDate(readingDate, expectedServiceMonth, expectedChargeMonth) {
  const serviceMonth = formatMonthYear(getServiceMonthFromReadingDate(readingDate));
  const chargeMonth = formatMonthYear(
    getChargeMonthFromServiceMonth(getServiceMonthFromReadingDate(readingDate)),
  );

  if (serviceMonth !== expectedServiceMonth) {
    throw new Error(
      `Expected service month ${expectedServiceMonth} for ${readingDate}, got ${serviceMonth}`,
    );
  }

  if (chargeMonth !== expectedChargeMonth) {
    throw new Error(
      `Expected charge month ${expectedChargeMonth} for ${readingDate}, got ${chargeMonth}`,
    );
  }
}

assertDate("2026-07-06", "Jun 2026", "Jul 2026");
assertDate("2026-03-05", "Feb 2026", "Mar 2026");
assertDate("2027-01-05", "Dec 2026", "Jan 2027");

console.log("Water date semantics verified.");
