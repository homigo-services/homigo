export interface DashboardStat {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
}

/** Dashboard recent-bookings row (lowercase DB statuses). */
export interface DashboardBookingRow {
  id: string;
  customerName: string;
  service: string;
  worker: string;
  status: string;
  date: string;
}

export const navItems = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "Bookings", href: "/admin/bookings", icon: "bookings" },
  { label: "Service Requests", href: "/admin/service-requests", icon: "requests" },
  { label: "Customers", href: "/admin/customers", icon: "customers" },
  { label: "Workers", href: "/admin/workers", icon: "workers" },
  { label: "Rate Cards", href: "/admin/rate-cards", icon: "payments" },
  { label: "Payments", href: "/admin/payments", icon: "payments" },
  { label: "Reports", href: "/admin/reports", icon: "reports" },
  { label: "Settings", href: "/admin/settings", icon: "settings" },
] as const;

export const quickActions = [
  { label: "Add Worker", description: "Register a new service professional" },
  { label: "Create Booking", description: "Manually add a customer booking" },
  { label: "Assign Worker", description: "Match workers to pending jobs" },
  { label: "Export Report", description: "Download monthly performance data" },
] as const;
