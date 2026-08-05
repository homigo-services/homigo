export type BookingStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";

export interface DashboardStat {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
}

export interface Booking {
  id: string;
  customerName: string;
  service: string;
  worker: string;
  status: BookingStatus;
  date: string;
}

export const dashboardStats: DashboardStat[] = [
  {
    label: "Total Bookings",
    value: "1,284",
    change: "+12.5%",
    trend: "up",
  },
  {
    label: "Pending Jobs",
    value: "47",
    change: "+3 today",
    trend: "neutral",
  },
  {
    label: "Completed Jobs",
    value: "1,156",
    change: "+8.2%",
    trend: "up",
  },
  {
    label: "Active Workers",
    value: "86",
    change: "+4 this week",
    trend: "up",
  },
  {
    label: "Total Customers",
    value: "2,340",
    change: "+18.1%",
    trend: "up",
  },
  {
    label: "Monthly Revenue",
    value: "₹4,82,500",
    change: "+22.4%",
    trend: "up",
  },
];

export const recentBookings: Booking[] = [
  {
    id: "HG-10482",
    customerName: "Priya Sharma",
    service: "Electrician",
    worker: "Ravi Kumar",
    status: "In Progress",
    date: "Jul 29, 2026",
  },
  {
    id: "HG-10481",
    customerName: "Amit Patel",
    service: "Plumber",
    worker: "Unassigned",
    status: "Pending",
    date: "Jul 29, 2026",
  },
  {
    id: "HG-10480",
    customerName: "Sneha Reddy",
    service: "Water Purifier",
    worker: "Suresh Nair",
    status: "Completed",
    date: "Jul 28, 2026",
  },
  {
    id: "HG-10479",
    customerName: "Rahul Mehta",
    service: "Carpenter",
    worker: "Anil Verma",
    status: "Completed",
    date: "Jul 28, 2026",
  },
  {
    id: "HG-10478",
    customerName: "Kavita Singh",
    service: "Electrician",
    worker: "Unassigned",
    status: "Pending",
    date: "Jul 27, 2026",
  },
  {
    id: "HG-10477",
    customerName: "Vikram Joshi",
    service: "Plumber",
    worker: "Mohit Das",
    status: "Cancelled",
    date: "Jul 27, 2026",
  },
  {
    id: "HG-10476",
    customerName: "Ananya Iyer",
    service: "Carpenter",
    worker: "Deepak Rao",
    status: "In Progress",
    date: "Jul 26, 2026",
  },
];

export const navItems = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "Bookings", href: "/admin/bookings", icon: "bookings" },
  { label: "Customers", href: "/admin/customers", icon: "customers" },
  { label: "Workers", href: "/admin/workers", icon: "workers" },
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
