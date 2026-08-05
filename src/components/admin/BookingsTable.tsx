import type { Booking, BookingStatus } from "@/lib/admin-data";
import { cn } from "@/lib/cn";

const statusStyles: Record<BookingStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  "In Progress": "bg-blue-50 text-blue-700 ring-blue-600/20",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Cancelled: "bg-red-50 text-red-700 ring-red-600/20",
};

function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        statusStyles[status],
      )}
    >
      {status}
    </span>
  );
}

interface BookingsTableProps {
  bookings: Booking[];
}

export function BookingsTable({ bookings }: BookingsTableProps) {
  return (
    <>
      {/* Mobile & small tablet: card layout */}
      <div className="divide-y divide-slate-100 md:hidden">
        {bookings.map((booking) => (
          <div key={booking.id} className="space-y-3 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-homigo-primary">{booking.id}</p>
                <p className="mt-0.5 truncate text-sm text-slate-700">
                  {booking.customerName}
                </p>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Service</dt>
                <dd className="font-medium text-slate-700">{booking.service}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Date</dt>
                <dd className="text-slate-600">{booking.date}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-slate-400">Worker</dt>
                <dd
                  className={cn(
                    "font-medium",
                    booking.worker === "Unassigned"
                      ? "italic text-slate-400"
                      : "text-slate-700",
                  )}
                >
                  {booking.worker}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-homigo-secondary transition-colors hover:bg-blue-50 sm:w-auto sm:px-6"
            >
              View
            </button>
          </div>
        ))}
      </div>

      {/* Tablet & desktop: table layout */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left text-sm lg:min-w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <th className="px-4 py-3 font-semibold text-slate-600 lg:px-6">
                Booking ID
              </th>
              <th className="px-3 py-3 font-semibold text-slate-600 lg:px-4">
                Customer Name
              </th>
              <th className="px-3 py-3 font-semibold text-slate-600 lg:px-4">
                Service
              </th>
              <th className="hidden px-3 py-3 font-semibold text-slate-600 lg:table-cell lg:px-4">
                Worker
              </th>
              <th className="px-3 py-3 font-semibold text-slate-600 lg:px-4">
                Status
              </th>
              <th className="hidden px-3 py-3 font-semibold text-slate-600 sm:table-cell lg:px-4">
                Date
              </th>
              <th className="px-4 py-3 font-semibold text-slate-600 lg:px-6">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.map((booking) => (
              <tr
                key={booking.id}
                className="transition-colors hover:bg-slate-50/60"
              >
                <td className="px-4 py-4 font-medium text-homigo-primary lg:px-6">
                  {booking.id}
                </td>
                <td className="max-w-[120px] truncate px-3 py-4 text-slate-700 lg:max-w-none lg:px-4">
                  {booking.customerName}
                </td>
                <td className="px-3 py-4 text-slate-600 lg:px-4">
                  {booking.service}
                </td>
                <td className="hidden px-3 py-4 text-slate-600 lg:table-cell lg:px-4">
                  <span
                    className={
                      booking.worker === "Unassigned"
                        ? "italic text-slate-400"
                        : ""
                    }
                  >
                    {booking.worker}
                  </span>
                </td>
                <td className="px-3 py-4 lg:px-4">
                  <StatusBadge status={booking.status} />
                </td>
                <td className="hidden px-3 py-4 text-slate-500 sm:table-cell lg:px-4">
                  {booking.date}
                </td>
                <td className="px-4 py-4 lg:px-6">
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-xs font-semibold text-homigo-secondary transition-colors hover:bg-blue-50 sm:text-sm"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
