/** Homigo WhatsApp booking — canonical service catalog (fixed order). */
export const HOMIGO_BOOKING_SERVICE_NAMES = [
  "AC Technician",
  "Electrician",
  "Plumber",
  "Carpenter",
  "Motor Technician",
] as const;

export type HomigoBookingServiceName = (typeof HOMIGO_BOOKING_SERVICE_NAMES)[number];

/** Customer-facing service price before payment-method discount. */
export const HOMIGO_SERVICE_BASE_PRICE = 1000;

/** Cash payment amount (₹). */
export const HOMIGO_CASH_PAYMENT_AMOUNT = 1000;

/** UPI payment amount after ₹10 discount. */
export const HOMIGO_UPI_PAYMENT_AMOUNT = 990;

export const HOMIGO_UPI_DISCOUNT = 10;

/** Bookings allowed from today through today + 7 days (8 dates). */
export const HOMIGO_BOOKING_DATE_WINDOW_DAYS = 7;

export function homigoRateCardTitle(serviceName: string): string {
  return `Homigo Rate Card - ${serviceName}`;
}

/** Workers contacted per matching batch (Batch 1, Batch 2, …). */
export const WORKER_BATCH_SIZE = 3;
