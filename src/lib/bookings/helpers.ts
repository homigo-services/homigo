import type { BookingStatus, PaymentStatus } from "./types";

export function formatBookingStatus(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "assigned":
      return "Assigned";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function formatPaymentStatus(status: PaymentStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "paid":
      return "Paid";
    case "failed":
      return "Failed";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTimeSlot(slot: string | null | undefined): string {
  if (!slot) return "—";
  const parts = slot.split(":");
  if (parts.length < 2) return slot;
  const hour = Number.parseInt(parts[0] ?? "0", 10);
  const minute = parts[1]?.slice(0, 2) ?? "00";
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${minute} ${suffix}`;
}

export function bookingStatusBadgeClass(status: BookingStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700";
    case "assigned":
      return "bg-blue-100 text-blue-700";
    case "in_progress":
      return "bg-indigo-100 text-indigo-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-yellow-100 text-yellow-700";
  }
}

export function paymentStatusBadgeClass(status: PaymentStatus): string {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-700";
    case "failed":
      return "bg-red-100 text-red-700";
    default:
      return "bg-yellow-100 text-yellow-700";
  }
}

export function shortBookingId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
