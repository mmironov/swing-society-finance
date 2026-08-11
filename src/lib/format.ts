/** Display helpers for dates and periods. Money formatting lives in @/domain/money. */

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat("en-GB", { month: "short" });

/** Formats an ISO "YYYY-MM-DD" date. Parsed as UTC so it never shifts a day. */
export function formatDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(`${iso}T00:00:00Z`));
}

/** Formats an ISO "YYYY-MM" month as e.g. "Oct 2026". */
export function formatMonth(month: string): string {
  return MONTH_FORMATTER.format(new Date(`${month}-01T00:00:00Z`));
}

/** Short month label for chart axes, e.g. "Oct". */
export function formatMonthShort(month: string): string {
  return MONTH_SHORT_FORMATTER.format(new Date(`${month}-01T00:00:00Z`));
}

export function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Every month between two ISO dates, inclusive, as "YYYY-MM". */
export function monthsBetween(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return months;

  const cursor = new Date(start);
  while (cursor <= end && months.length < 240) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(2).replace(/0$/, "")}h`;
}
