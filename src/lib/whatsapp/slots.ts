/** India Standard Time — customer-local scheduling for Homigo. */
export const CUSTOMER_TIMEZONE = "Asia/Kolkata";

export interface TimeSlotOption {
  index: number;
  value: string;
  startHour: number;
  endHour: number;
}

export const TIME_SLOTS: TimeSlotOption[] = [
  { index: 1, value: "08:00-10:00", startHour: 8, endHour: 10 },
  { index: 2, value: "10:00-12:00", startHour: 10, endHour: 12 },
  { index: 3, value: "12:00-14:00", startHour: 12, endHour: 14 },
  { index: 4, value: "14:00-16:00", startHour: 14, endHour: 16 },
  { index: 5, value: "16:00-18:00", startHour: 16, endHour: 18 },
  { index: 6, value: "18:00-20:00", startHour: 18, endHour: 20 },
  { index: 7, value: "20:00-22:00", startHour: 20, endHour: 22 },
];

function partsInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return { year, month, day };
}

/** YYYY-MM-DD in customer timezone. */
export function formatDateIso(date: Date, timeZone = CUSTOMER_TIMEZONE): string {
  const { year, month, day } = partsInTimezone(date, timeZone);
  return `${year}-${month}-${day}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return formatDateIso(utc);
}

export function todayIso(now = new Date()): string {
  return formatDateIso(now);
}

export function tomorrowIso(now = new Date()): string {
  return addDaysIso(todayIso(now), 1);
}

export function isPastDate(isoDate: string, now = new Date()): boolean {
  return isoDate < todayIso(now);
}

/** Parse YYYY-MM-DD or DD-MM-YYYY or DD/MM/YYYY. */
export function parseCustomerDateInput(
  text: string,
  now = new Date(),
): string | null {
  const trimmed = text.trim();

  let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3];
    return `${year}-${month}-${day}`;
  }

  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    if (n === 1) return todayIso(now);
    if (n === 2) return tomorrowIso(now);
  }

  return null;
}

export function parseSlotSelection(text: string): TimeSlotOption | null {
  const n = Number.parseInt(text.trim(), 10);
  if (!Number.isFinite(n)) return null;
  return TIME_SLOTS.find((s) => s.index === n) ?? null;
}

export function formatDisplayDate(
  isoDate: string,
  lang: "en" | "mr" | "hi",
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const locale = lang === "mr" ? "mr-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
