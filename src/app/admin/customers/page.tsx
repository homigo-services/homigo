export default function CustomersPage() {
    const stats = [
      {
        title: "Total Customers",
        value: "1,248",
        icon: "👥",
      },
      {
        title: "Active Customers",
        value: "986",
        icon: "✅",
      },
      {
        title: "New Customers",
        value: "124",
        icon: "🆕",
      },
      {
        title: "Total Bookings",
        value: "3,540",
        icon: "📋",
      },
    ];
  
    const customers = [
      {
        id: "HG-C001",
        name: "Amit Sharma",
        mobile: "9876543210",
        email: "amit@gmail.com",
        city: "Pune",
        bookings: 12,
        lastService: "Electrician",
        status: "Active",
      },
      {
        id: "HG-C002",
        name: "Priya Patil",
        mobile: "9898989898",
        email: "priya@gmail.com",
        city: "Mumbai",
        bookings: 8,
        lastService: "Water Purifier",
        status: "Active",
      },
      {
        id: "HG-C003",
        name: "Rahul More",
        mobile: "9123456789",
        email: "rahul@gmail.com",
        city: "Nashik",
        bookings: 3,
        lastService: "Plumber",
        status: "Inactive",
      },
    ];
  
  
    return (
      <div className="space-y-8">
  
  
        {/* Header */}
  
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
  
          <div>
  
            <h1 className="text-3xl font-bold text-homigo-primary">
              Customers Management
            </h1>
  
            <p className="mt-2 text-slate-500">
              Manage Homigo customer information and service history.
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
            shadow
            hover:bg-blue-800
            "
          >
            + Add Customer
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
              border-slate-100
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
  
  
  
        {/* Search */}
  
        <div
          className="
          rounded-2xl
          bg-white
          p-6
          shadow-sm
          border
          border-slate-100
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
              placeholder="Search customer name or mobile..."
              className="
              w-full
              rounded-xl
              border
              border-slate-300
              px-5
              py-3
              outline-none
              focus:border-blue-700
              lg:w-96
              "
            />
  
  
            <select
              className="
              rounded-xl
              border
              border-slate-300
              px-5
              py-3
              "
            >
  
              <option>
                All Status
              </option>
  
              <option>
                Active
              </option>
  
              <option>
                Inactive
              </option>
  
            </select>
  
  
          </div>
  
  
  
          {/* Desktop Table */}
  
          <div className="mt-8 hidden overflow-x-auto lg:block">
  
  
            <table className="w-full border-separate border-spacing-y-3">
  
  
              <thead>
  
                <tr className="text-left text-sm text-slate-500">
  
                  <th className="px-4 py-3">
                    ID
                  </th>
  
                  <th className="px-4 py-3">
                    Customer
                  </th>
  
                  <th className="px-4 py-3">
                    Mobile
                  </th>
  
                  <th className="px-4 py-3">
                    City
                  </th>
  
                  <th className="px-4 py-3">
                    Bookings
                  </th>
  
                  <th className="px-4 py-3">
                    Last Service
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
  
  
                {customers.map((customer)=>(
  
                  <tr
                    key={customer.id}
                    className="bg-slate-50 text-sm"
                  >
  
                    <td className="px-4 py-5 font-semibold">
                      {customer.id}
                    </td>
  
  
                    <td className="px-4 py-5">
  
                      <p className="font-semibold text-homigo-primary">
                        {customer.name}
                      </p>
  
                      <p className="text-xs text-slate-500">
                        {customer.email}
                      </p>
  
                    </td>
  
  
                    <td className="px-4 py-5">
                      {customer.mobile}
                    </td>
  
  
                    <td className="px-4 py-5">
                      {customer.city}
                    </td>
  
  
                    <td className="px-4 py-5">
                      {customer.bookings}
                    </td>
  
  
                    <td className="px-4 py-5">
                      {customer.lastService}
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
                          customer.status==="Active"
                          ?"bg-green-100 text-green-700"
                          :"bg-red-100 text-red-700"
                        }
                        `}
                      >
                        {customer.status}
                      </span>
  
                    </td>
  
  
  
                    <td className="px-4 py-5">
  
                      <div className="flex justify-center gap-3">
  
                        <button className="
                        rounded-lg
                        bg-blue-900
                        px-4
                        py-2
                        text-white
                        ">
                          View
                        </button>
  
  
                        <button className="
                        rounded-lg
                        bg-yellow-400
                        px-4
                        py-2
                        font-semibold
                        ">
                          Edit
                        </button>
  
  
                      </div>
  
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