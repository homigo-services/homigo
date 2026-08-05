export default function ReportsPage() {
  const stats = [
    {
      title: "Total Revenue",
      value: "₹8,42,500",
      color: "text-green-600",
    },
    {
      title: "Total Bookings",
      value: "2,418",
      color: "text-blue-900",
    },
    {
      title: "Active Workers",
      value: "112",
      color: "text-orange-500",
    },
    {
      title: "Customers",
      value: "1,526",
      color: "text-purple-600",
    },
  ];

  const reports = [
    {
      id: "RPT001",
      month: "July 2026",
      bookings: 382,
      revenue: "₹1,28,500",
      commission: "₹18,250",
      workers: 96,
    },
    {
      id: "RPT002",
      month: "June 2026",
      bookings: 355,
      revenue: "₹1,16,200",
      commission: "₹16,430",
      workers: 91,
    },
    {
      id: "RPT003",
      month: "May 2026",
      bookings: 340,
      revenue: "₹1,09,900",
      commission: "₹15,860",
      workers: 88,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 p-8">

      {/* Header */}

      <div className="mb-8 flex items-center justify-between">

        <div>

          <h1 className="text-4xl font-bold text-blue-950">
            Reports & Analytics
          </h1>

          <p className="mt-2 text-slate-500">
            Revenue, bookings and business insights.
          </p>

        </div>

        <div className="flex gap-3">

          <button className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700">
            Export Excel
          </button>

          <button className="rounded-xl bg-blue-900 px-5 py-3 font-semibold text-white hover:bg-blue-800">
            Download PDF
          </button>

        </div>

      </div>

      {/* Cards */}

      <div className="mb-8 grid gap-6 md:grid-cols-4">

        {stats.map((item) => (

          <div
            key={item.title}
            className="rounded-2xl bg-white p-6 shadow"
          >

            <p className="text-slate-500">
              {item.title}
            </p>

            <h2 className={`mt-3 text-4xl font-bold ${item.color}`}>
              {item.value}
            </h2>

          </div>

        ))}

      </div>

      {/* Charts Placeholder */}

      <div className="mb-8 grid gap-6 md:grid-cols-2">

        <div className="flex h-80 items-center justify-center rounded-2xl bg-white shadow">

          <div className="text-center">

            <h2 className="text-2xl font-bold text-blue-900">
              Monthly Revenue Chart
            </h2>

            <p className="mt-3 text-slate-500">
              (Chart will be connected later)
            </p>

          </div>

        </div>

        <div className="flex h-80 items-center justify-center rounded-2xl bg-white shadow">

          <div className="text-center">

            <h2 className="text-2xl font-bold text-blue-900">
              Booking Analytics
            </h2>

            <p className="mt-3 text-slate-500">
              (Chart will be connected later)
            </p>

          </div>

        </div>

      </div>

      {/* Filters */}

      <div className="mb-6 flex flex-wrap gap-4 rounded-2xl bg-white p-6 shadow">

        <select className="rounded-xl border px-5 py-3">
          <option>All Months</option>
          <option>July</option>
          <option>June</option>
          <option>May</option>
        </select>

        <select className="rounded-xl border px-5 py-3">
          <option>All Services</option>
          <option>Electrician</option>
          <option>Plumber</option>
          <option>Carpenter</option>
        </select>

        <select className="rounded-xl border px-5 py-3">
          <option>All Cities</option>
          <option>Pune</option>
          <option>Mumbai</option>
          <option>Nashik</option>
        </select>

      </div>

      {/* Reports Table */}

      <div className="rounded-2xl bg-white p-6 shadow">

        <table className="w-full border-separate border-spacing-y-3">

          <thead>

            <tr className="text-center text-slate-600">

              <th>ID</th>
              <th>Month</th>
              <th>Bookings</th>
              <th>Revenue</th>
              <th>Commission</th>
              <th>Workers</th>
              <th>Action</th>

            </tr>

          </thead>

          <tbody>

            {reports.map((report) => (

              <tr
                key={report.id}
                className="bg-slate-50 shadow-sm"
              >

                <td className="rounded-l-xl py-5 text-center">
                  {report.id}
                </td>

                <td className="py-5 text-center">
                  {report.month}
                </td>

                <td className="py-5 text-center">
                  {report.bookings}
                </td>

                <td className="py-5 text-center font-semibold text-green-600">
                  {report.revenue}
                </td>

                <td className="py-5 text-center">
                  {report.commission}
                </td>

                <td className="py-5 text-center">
                  {report.workers}
                </td>

                <td className="rounded-r-xl py-5 text-center">

                  <button className="rounded-lg bg-blue-900 px-5 py-2 text-white hover:bg-blue-800">
                    View Report
                  </button>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}