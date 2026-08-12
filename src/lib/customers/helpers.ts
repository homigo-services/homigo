import type { CustomerPreferredLanguage } from "./types";

export function formatCustomerStatus(status: string): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatLanguage(code: CustomerPreferredLanguage | string): string {
  switch (code) {
    case "mr":
      return "मराठी";
    case "hi":
      return "हिंदी";
    case "en":
      return "English";
    default:
      return code;
  }
}

export function matchesCustomerSearch(
  customer: { name: string; mobile: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    customer.name.toLowerCase().includes(q) ||
    customer.mobile.includes(q)
  );
}

export function shortCustomerId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
