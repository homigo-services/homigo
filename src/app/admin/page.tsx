import { BookingsTable } from "@/components/admin/BookingsTable";
import { QuickActionsPanel } from "@/components/admin/QuickActionsPanel";
import { StatCard } from "@/components/admin/StatCard";
import { dashboardStats, recentBookings } from "@/lib/admin-data";

export default function AdminDashboardPage() {
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

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {dashboardStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        {/* Recent Bookings */}
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
            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-homigo-primary transition-all hover:border-homigo-secondary hover:bg-slate-50 sm:w-auto"
            >
              View All
            </button>
          </div>

          <BookingsTable bookings={recentBookings} />
        </div>

        <QuickActionsPanel />
      </div>
    </div>
  );
}
