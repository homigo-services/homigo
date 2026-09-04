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

/** DD-MM-YYYY for customer-facing date labels. */
export function formatIsoAsDdMmYyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}-${m}-${y}`;
}

import { HOMIGO_BOOKING_DATE_WINDOW_DAYS } from "./homigo-services";

/** Latest bookable date (today + window days). */
export function maxBookingDateIso(now = new Date()): string {
  return addDaysIso(todayIso(now), HOMIGO_BOOKING_DATE_WINDOW_DAYS);
}

export function isWithinBookingWindow(isoDate: string, now = new Date()): boolean {
  if (isPastDate(isoDate, now)) return false;
  return isoDate <= maxBookingDateIso(now);
}

export interface BookingDateOption {
  index: number;
  iso: string;
  label: string;
}

/** Primary date menu: 1 = today, 2 = tomorrow, 3 = custom DD-MM-YYYY. */
export function bookingDateOptions(now = new Date()): BookingDateOption[] {
  return [
    { index: 1, iso: todayIso(now), label: `Today (${formatIsoAsDdMmYyyy(todayIso(now))})` },
    {
      index: 2,
      iso: tomorrowIso(now),
      label: `Tomorrow (${formatIsoAsDdMmYyyy(tomorrowIso(now))})`,
    },
    { index: 3, iso: "", label: "Another date (DD-MM-YYYY)" },
  ];
}

/** True when customer chose menu option 3 (custom date entry). */
export function isCustomDateMenuChoice(text: string): boolean {
  return text.trim() === "3";
}

/** Parse date menu selection or DD-MM-YYYY within the booking window. */
export function parseBookingDateSelection(text: string, now = new Date()): string | null {
  const trimmed = text.trim();

  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    if (n === 1) {
      const iso = todayIso(now);
      return isWithinBookingWindow(iso, now) ? iso : null;
    }
    if (n === 2) {
      const iso = tomorrowIso(now);
      return isWithinBookingWindow(iso, now) ? iso : null;
    }
    return null;
  }

  let iso: string | null = null;
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    iso = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  } else {
    const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
  }

  if (!iso || !isWithinBookingWindow(iso, now)) return null;
  return iso;
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
