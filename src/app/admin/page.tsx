import Link from "next/link";
import { BookingsTable } from "@/components/admin/BookingsTable";
import { QuickActionsPanel } from "@/components/admin/QuickActionsPanel";
import { StatCard } from "@/components/admin/StatCard";
import type { DashboardBookingRow, DashboardStat } from "@/lib/admin-data";
import { formatCurrency, formatDate } from "@/lib/bookings/helpers";
import { listBookings, getBookingStats } from "@/lib/bookings/queries";
import { getCustomerStats } from "@/lib/customers/queries";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function loadDashboardData(): Promise<{
  stats: DashboardStat[];
  recentBookings: DashboardBookingRow[];
  error: string | null;
}> {
  try {
    const supabase = createSupabaseServerClient();
    const [bookingStats, customerStats, recentResult] = await Promise.all([
      getBookingStats(supabase),
      getCustomerStats(supabase),
      listBookings(supabase, { limit: 8 }),
    ]);

    if (bookingStats.error) {
      return { stats: [], recentBookings: [], error: bookingStats.error };
    }

    const stats: DashboardStat[] = [
      {
        label: "Total Bookings",
        value: String(bookingStats.total),
        change: `${bookingStats.pending} pending`,
        trend: "neutral",
      },
      {
        label: "Pending Jobs",
        value: String(bookingStats.pending),
        change: `${bookingStats.assigned} assigned`,
        trend: "neutral",
      },
      {
        label: "Completed Jobs",
        value: String(bookingStats.completed),
        change: `${bookingStats.inProgress} in progress`,
        trend: "up",
      },
      {
        label: "Total Customers",
        value: String(customerStats.total),
        change: `${customerStats.active} active`,
        trend: "up",
      },
      {
        label: "Cancelled",
        value: String(bookingStats.cancelled),
        change: "bookings",
        trend: "down",
      },
      {
        label: "Revenue (Paid)",
        value: formatCurrency(bookingStats.totalRevenue),
        change: "from paid bookings",
        trend: "up",
      },
    ];

    const recentBookings: DashboardBookingRow[] = (recentResult.data ?? []).map(
      (b) => ({
        id: b.id,
        customerName: b.customer_name,
        service: b.service_type,
        worker: b.worker_name === "Unassigned" ? "Unassigned" : b.worker_name,
        status: b.booking_status,
        date: formatDate(b.service_date),
      }),
    );

    return { stats, recentBookings, error: recentResult.error };
  } catch (err) {
    return {
      stats: [],
      recentBookings: [],
      error: err instanceof Error ? err.message : "Failed to load dashboard",
    };
  }
}

export default async function AdminDashboardPage() {
  const { stats, recentBookings, error } = await loadDashboardData();

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-homigo-primary sm:text-2xl md:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 text-xs text-slate-500 sm:text-sm md:text-base">
          Overview of your home services operations
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load dashboard data: {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm xl:col-span-2">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 md:px-6 md:py-4">
            <div>
              <h2 className="text-base font-bold text-homigo-primary sm:text-lg">
                Recent Bookings
              </h2>
              <p className="text-xs text-slate-500 sm:text-sm">
                Latest customer service requests
              </p>
            </div>
            <Link
              href="/admin/bookings"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-homigo-primary transition-all hover:border-homigo-secondary hover:bg-slate-50 sm:w-auto"
            >
              View All
            </Link>
          </div>

          <BookingsTable bookings={recentBookings} />
        </div>

        <QuickActionsPanel />
      </div>
    </div>
  );
}
