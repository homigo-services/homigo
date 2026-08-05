export default function BookingsPage() {

    const stats = [
      {
        title: "Total Bookings",
        value: "3,540",
        icon: "📋",
      },
      {
        title: "Pending Assignment",
        value: "42",
        icon: "⏳",
      },
      {
        title: "Ongoing Jobs",
        value: "18",
        icon: "🔧",
      },
      {
        title: "Completed Jobs",
        value: "3,210",
        icon: "✅",
      },
    ];
  
  
    const bookings = [
      {
        id: "HG-B001",
        customer: "Amit Sharma",
        mobile: "9876543210",
        service: "Electrician",
        worker: "Ramesh Patil",
        address: "Pune",
        date: "29 July 2026",
        amount: "₹500",
        payment: "UPI",
        status: "Assigned",
      },
      {
        id: "HG-B002",
        customer: "Priya Patil",
        mobile: "9898989898",
        service: "Water Purifier",
        worker: "Not Assigned",
        address: "Mumbai",
        date: "29 July 2026",
        amount: "₹800",
        payment: "Pending",
        status: "Pending",
      },
      {
        id: "HG-B003",
        customer: "Rahul More",
        mobile: "9123456789",
        service: "Plumber",
        worker: "Ganesh More",
        address: "Nashik",
        date: "28 July 2026",
        amount: "₹600",
        payment: "Cash",
        status: "Completed",
      },
    ];
  
  
    return (
  
      <div className="space-y-8">
  
  
        {/* Header */}
  
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
  
          <div>
  
            <h1 className="text-3xl font-bold text-homigo-primary">
              Bookings Management
            </h1>
  
            <p className="mt-2 text-slate-500">
              Manage customer bookings, worker assignments and payments.
            </p>
  
          </div>
  
  
          <button
            className="
            rounded-xl
            bg-blue-900
            px-6
            py-3
            font-semibold
            text-white
            hover:bg-blue-800
            "
          >
            + Create Booking
          </button>
  
        </div>
  
  
  
  
        {/* Stats */}
  
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
  
          {stats.map((item)=>(
  
            <div
              key={item.title}
              className="
              rounded-2xl
              border
              bg-white
              p-6
              shadow-sm
              "
            >
  
              <div className="flex justify-between">
  
                <p className="text-sm text-slate-500">
                  {item.title}
                </p>
  
                <span className="text-2xl">
                  {item.icon}
                </span>
  
              </div>
  
  
              <h2 className="
              mt-4
              text-3xl
              font-bold
              text-homigo-primary
              ">
                {item.value}
              </h2>
  
  
            </div>
  
          ))}
  
        </div>
  
  
  
  
        {/* Filters */}
  
        <div
          className="
          rounded-2xl
          bg-white
          p-6
          shadow-sm
          "
        >
  
          <div className="
          flex
          flex-col
          gap-4
          lg:flex-row
          lg:justify-between
          ">
  
  
            <input
  
              placeholder="Search booking ID, customer or mobile..."
  
              className="
              w-full
              rounded-xl
              border
              px-5
              py-3
              lg:w-96
              "
  
            />
  
  
            <div className="flex flex-col gap-4 sm:flex-row">
  
  
              <select className="rounded-xl border px-5 py-3">
  
                <option>
                  All Services
                </option>
  
                <option>
                  Electrician
                </option>
  
                <option>
                  Plumber
                </option>
  
                <option>
                  Water Purifier
                </option>
  
  
              </select>
  
  
  
              <select className="rounded-xl border px-5 py-3">
  
                <option>
                  All Status
                </option>
  
                <option>
                  Pending
                </option>
  
                <option>
                  Assigned
                </option>
  
                <option>
                  Completed
                </option>
  
  
              </select>
  
  
            </div>
  
  
          </div>
  
  
  
  
          {/* Table */}
  
          <div className="mt-8 hidden overflow-x-auto lg:block">
  
  
            <table className="w-full border-separate border-spacing-y-3">
  
  
              <thead>
  
                <tr className="text-left text-sm text-slate-500">
  
  
                  <th className="px-4 py-3">
                    Booking ID
                  </th>
  
  
                  <th className="px-4 py-3">
                    Customer
                  </th>
  
  
                  <th className="px-4 py-3">
                    Service
                  </th>
  
  
                  <th className="px-4 py-3">
                    Assigned Worker
                  </th>
  
  
                  <th className="px-4 py-3">
                    Date
                  </th>
  
  
                  <th className="px-4 py-3">
                    Amount
                  </th>
  
  
                  <th className="px-4 py-3">
                    Payment
                  </th>
  
  
                  <th className="px-4 py-3">
                    Status
                  </th>
  
  
                  <th className="px-4 py-3 text-center">
                    Action
                  </th>
  
  
                </tr>
  
              </thead>
  
  
  
              <tbody>
  
  
                {bookings.map((booking)=>(
  
  
                  <tr
                    key={booking.id}
                    className="bg-slate-50 text-sm"
                  >
  
  
                    <td className="px-4 py-5 font-semibold">
                      {booking.id}
                    </td>
  
  
  
                    <td className="px-4 py-5">
  
                      <p className="font-semibold text-homigo-primary">
                        {booking.customer}
                      </p>
  
                      <p className="text-xs text-slate-500">
                        {booking.mobile}
                      </p>
  
                    </td>
  
  
  
                    <td className="px-4 py-5">
                      {booking.service}
                    </td>
  
  
  
                    <td className="px-4 py-5">
  
                      {booking.worker}
  
                    </td>
  
  
  
                    <td className="px-4 py-5">
                      {booking.date}
                    </td>
  
  
  
                    <td className="px-4 py-5">
                      {booking.amount}
                    </td>
  
  
  
                    <td className="px-4 py-5">
                      {booking.payment}
                    </td>
  
  
  
                    <td className="px-4 py-5">
  
  
                      <span
                        className={`
                        rounded-full
                        px-4
                        py-2
                        text-xs
                        font-semibold
  
                        ${
                          booking.status==="Completed"
                          ?"bg-green-100 text-green-700"
                          :
                          booking.status==="Assigned"
                          ?"bg-blue-100 text-blue-700"
                          :
                          "bg-yellow-100 text-yellow-700"
                        }
  
                        `}
                      >
  
                        {booking.status}
  
                      </span>
  
  
                    </td>
  
  
  
  
                    <td className="px-4 py-5">
  
  
                      <button
                        className="
                        rounded-lg
                        bg-blue-900
                        px-4
                        py-2
                        text-white
                        "
                      >
  
                        View Details
  
                      </button>
  
  
                    </td>
  
  
  
                  </tr>
  
  
                ))}
  
  
              </tbody>
  
  
            </table>
  
  
          </div>
  
  
        </div>
  
  
      </div>
  
    );
  }