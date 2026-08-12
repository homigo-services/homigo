import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import { sendWhatsAppText } from "./client";
import {
  bookingConfirmationMessage,
  type BookingConfirmationDetails,
} from "./booking-confirmation";

export { bookingConfirmationMessage as workerAssignedMessage };

/** @deprecated Use finalizeBookingAfterWorkerAccept from booking-confirmation.ts */
export async function sendWorkerAssignedNotification(input: {
  customerMobile: string;
  language: CustomerPreferredLanguage;
  workerName: string;
  workerArea: string | null;
  serviceType: string;
  serviceDate: string;
  timeSlot: string;
  bookingId?: string;
  finalAmount?: number;
}): Promise<void> {
  const details: BookingConfirmationDetails = {
    bookingId: input.bookingId ?? "00000000-0000-0000-0000-000000000000",
    bookingRef: input.bookingId
      ? input.bookingId.replace(/-/g, "").slice(0, 8).toUpperCase()
      : "—",
    workerName: input.workerName,
    workerArea: input.workerArea,
    serviceType: input.serviceType,
    serviceDate: input.serviceDate,
    timeSlot: input.timeSlot,
    finalAmount: input.finalAmount ?? 0,
  };

  const body = bookingConfirmationMessage(input.language, details);
  await sendWhatsAppText(input.customerMobile, body);
}
