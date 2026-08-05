export default function PaymentsPage() {

    const stats = [
      {
        title: "Total Revenue",
        value: "₹8,42,500",
        icon: "💰",
      },
      {
        title: "Completed Payments",
        value: "3,210",
        icon: "✅",
      },
      {
        title: "Pending Payments",
        value: "42",
        icon: "⏳",
      },
      {
        title: "Homigo Commission",
        value: "₹1,12,400",
        icon: "🏦",
      },
    ];
  
    const payments = [
      {
        id: "PAY001",
        booking: "HG-B001",
        customer: "Amit Sharma",
        worker: "Ramesh Patil",
        amount: "₹500",
        commission: "₹100",
        payout: "₹400",
        mode: "UPI",
        status: "Completed",
        date: "29 Jul 2026",
      },
      {
        id: "PAY002",
        booking: "HG-B002",
        customer: "Priya Patil",
        worker: "Not Assigned",
        amount: "₹800",
        commission: "-",
        payout: "-",
        mode: "Pending",
        status: "Pending",
        date: "29 Jul 2026",
      },
      {
        id: "PAY003",
        booking: "HG-B003",
        customer: "Rahul More",
        worker: "Ganesh More",
        amount: "₹650",
        commission: "₹130",
        payout: "₹520",
        mode: "Cash",
        status: "Completed",
        date: "28 Jul 2026",
      },
    ];
  
    return (
  
      <div className="space-y-8">
  
        <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
  
          <div>
  
            <h1 className="text-3xl font-bold text-homigo-primary">
              Payments Management
            </h1>
  
            <p className="mt-2 text-slate-500">
              Track customer payments, worker payouts and Homigo commission.
            </p>
  
          </div>
  
          <button className="rounded-xl bg-blue-900 px-6 py-3 text-white font-semibold hover:bg-blue-800">
            + Record Payment
          </button>
  
        </div>
  
  
        {/* Stats */}
  
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
  
          {stats.map((item)=>(
  
            <div
              key={item.title}
              className="rounded-2xl bg-white p-6 shadow-sm border"
            >
  
              <div className="flex justify-between">
  
                <p className="text-sm text-slate-500">
                  {item.title}
                </p>
  
                <span className="text-2xl">
                  {item.icon}
                </span>
  
              </div>
  
              <h2 className="mt-4 text-3xl font-bold text-homigo-primary">
                {item.value}
              </h2>
  
            </div>
  
          ))}
  
        </div>
  
  
  
        {/* Search */}
  
        <div className="rounded-2xl bg-white p-6 shadow-sm">
  
          <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
  
            <input
              placeholder="Search Payment ID / Customer..."
              className="w-full rounded-xl border px-5 py-3 lg:w-96"
            />
  
            <div className="flex flex-col gap-4 sm:flex-row">
  
              <select className="rounded-xl border px-5 py-3">
                <option>All Modes</option>
                <option>UPI</option>
                <option>Cash</option>
                <option>Card</option>
              </select>
  
              <select className="rounded-xl border px-5 py-3">
                <option>All Status</option>
                <option>Completed</option>
                <option>Pending</option>
              </select>
  
            </div>
  
          </div>
  
  
  
          {/* Table */}
  
          <div className="mt-8 hidden overflow-x-auto lg:block">
  
            <table className="w-full border-separate border-spacing-y-3">
  
              <thead>
  
                <tr className="text-left text-sm text-slate-500">
  
                  <th className="px-4 py-3">Payment ID</th>
                  <th className="px-4 py-3">Booking</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Worker</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Commission</th>
                  <th className="px-4 py-3">Worker Gets</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
  
                </tr>
  
              </thead>
  
  
              <tbody>
  
                {payments.map((payment)=>(
  
                  <tr
                    key={payment.id}
                    className="bg-slate-50 text-sm"
                  >
  
                    <td className="px-4 py-5 font-semibold">
                      {payment.id}
                    </td>
  
                    <td className="px-4 py-5">
                      {payment.booking}
                    </td>
  
                    <td className="px-4 py-5">
                      {payment.customer}
                    </td>
  
                    <td className="px-4 py-5">
                      {payment.worker}
                    </td>
  
                    <td className="px-4 py-5">
                      {payment.amount}
                    </td>
  
                    <td className="px-4 py-5">
                      {payment.commission}
                    </td>
  
                    <td className="px-4 py-5">
                      {payment.payout}
                    </td>
  
                    <td className="px-4 py-5">
                      {payment.mode}
                    </td>
  
                    <td className="px-4 py-5">
  
                      <span
                        className={`rounded-full px-4 py-2 text-xs font-semibold ${
                          payment.status==="Completed"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {payment.status}
                      </span>
  
                    </td>
  
                    <td className="px-4 py-5">
  
                      <button className="rounded-lg bg-blue-900 px-4 py-2 text-white">
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