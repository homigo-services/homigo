export default function BookingDetailsPage() {
    const booking = {
      id: "HG-B001",
      status: "Assigned",
  
      customer: {
        name: "Amit Sharma",
        mobile: "9876543210",
        whatsapp: "9876543210",
        email: "amit@gmail.com",
        address: "Flat 202, ABC Society, Pune",
        city: "Pune",
      },
  
      service: {
        name: "Electrician",
        problem: "Fan not working",
        date: "29 July 2026",
        time: "5:00 PM",
        notes: "Customer requested urgent service",
      },
  
      worker: {
        name: "Ramesh Patil",
        mobile: "9876543210",
        rating: "4.8",
        assignedAt: "4:20 PM",
        status: "Accepted",
      },
  
      payment: {
        amount: "₹500",
        mode: "UPI",
        status: "Completed",
        transaction: "TXN123456",
      },
  
      otp: {
        start: "4821",
        end: "7634",
        verified: true,
      },
    };
  
  
    return (
      <div className="space-y-6">
  
  
        {/* Header */}
  
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
  
  
          <div>
  
            <h1 className="text-2xl font-bold text-homigo-primary">
              Booking {booking.id}
            </h1>
  
            <p className="mt-1 text-slate-500">
              Complete booking information
            </p>
  
          </div>
  
  
          <div className="flex gap-3">
  
  
            <button
              className="
              rounded-xl
              bg-blue-900
              px-5
              py-3
              text-white
              "
            >
              Change Worker
            </button>
  
  
            <button
              className="
              rounded-xl
              bg-green-600
              px-5
              py-3
              text-white
              "
            >
              Update Status
            </button>
  
  
          </div>
  
  
        </div>
  
  
  
  
        {/* Status */}
  
        <div className="rounded-2xl bg-blue-50 p-5">
  
          <p className="text-sm text-slate-500">
            Booking Status
          </p>
  
          <span
            className="
            mt-2
            inline-block
            rounded-full
            bg-blue-100
            px-4
            py-2
            text-sm
            font-semibold
            text-blue-700
            "
          >
            {booking.status}
          </span>
  
        </div>
  
  
  
  
  
        {/* Customer + Service */}
  
        <div className="grid gap-6 lg:grid-cols-2">
  
  
          <div className="rounded-2xl bg-white p-6 shadow-sm">
  
  
            <h2 className="text-lg font-bold text-homigo-primary">
              Customer Details
            </h2>
  
  
            <div className="mt-4 space-y-3 text-sm">
  
              <p>
                Name: <b>{booking.customer.name}</b>
              </p>
  
              <p>
                Mobile: {booking.customer.mobile}
              </p>
  
              <p>
                WhatsApp: {booking.customer.whatsapp}
              </p>
  
              <p>
                Email: {booking.customer.email}
              </p>
  
              <p>
                Address: {booking.customer.address}
              </p>
  
              <p>
                City: {booking.customer.city}
              </p>
  
  
            </div>
  
  
          </div>
  
  
  
  
  
          <div className="rounded-2xl bg-white p-6 shadow-sm">
  
  
            <h2 className="text-lg font-bold text-homigo-primary">
              Service Details
            </h2>
  
  
            <div className="mt-4 space-y-3 text-sm">
  
  
              <p>
                Service:
                <b> {booking.service.name}</b>
              </p>
  
  
              <p>
                Problem:
                {booking.service.problem}
              </p>
  
  
              <p>
                Date:
                {booking.service.date}
              </p>
  
  
              <p>
                Time:
                {booking.service.time}
              </p>
  
  
              <p>
                Notes:
                {booking.service.notes}
              </p>
  
  
            </div>
  
  
          </div>
  
  
        </div>
  
  
  
  
  
        {/* Worker */}
  
        <div className="rounded-2xl bg-white p-6 shadow-sm">
  
  
          <h2 className="text-lg font-bold text-homigo-primary">
            Assigned Worker
          </h2>
  
  
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  
  
            <div>
              <p className="text-sm text-slate-500">
                Name
              </p>
              <b>{booking.worker.name}</b>
            </div>
  
  
            <div>
              <p className="text-sm text-slate-500">
                Mobile
              </p>
              <b>{booking.worker.mobile}</b>
            </div>
  
  
            <div>
              <p className="text-sm text-slate-500">
                Rating
              </p>
              <b>⭐ {booking.worker.rating}</b>
            </div>
  
  
            <div>
              <p className="text-sm text-slate-500">
                Status
              </p>
              <b>{booking.worker.status}</b>
            </div>
  
  
          </div>
  
  
        </div>
  
  
  
  
  
  
        {/* Timeline */}
  
        <div className="rounded-2xl bg-white p-6 shadow-sm">
  
  
          <h2 className="text-lg font-bold text-homigo-primary">
            Booking Timeline
          </h2>
  
  
          <div className="mt-5 space-y-4">
  
  
            {[
              "Booking Created",
              "Worker Assigned",
              "Worker Accepted",
              "Service Started",
              "Service Completed",
            ].map((item,index)=>(
  
              <div
                key={item}
                className="flex items-center gap-3"
              >
  
                <div
                  className={`
                  h-3
                  w-3
                  rounded-full
                  ${
                    index < 3
                    ? "bg-green-600"
                    : "bg-slate-300"
                  }
                  `}
                />
  
                <p>
                  {item}
                </p>
  
  
              </div>
  
  
            ))}
  
  
          </div>
  
  
        </div>
  
  
  
  
  
  
        {/* OTP + Payment */}
  
        <div className="grid gap-6 lg:grid-cols-2">
  
  
          <div className="rounded-2xl bg-white p-6 shadow-sm">
  
  
            <h2 className="text-lg font-bold text-homigo-primary">
              OTP Verification
            </h2>
  
  
            <div className="mt-4 space-y-3">
  
  
              <p>
                Start OTP:
                <b> {booking.otp.start}</b>
              </p>
  
  
              <p>
                Completion OTP:
                <b> {booking.otp.end}</b>
              </p>
  
  
              <p>
                Verified:
                <b>
                  {booking.otp.verified ? " Yes" : " No"}
                </b>
              </p>
  
  
            </div>
  
  
          </div>
  
  
  
  
  
          <div className="rounded-2xl bg-white p-6 shadow-sm">
  
  
            <h2 className="text-lg font-bold text-homigo-primary">
              Payment Details
            </h2>
  
  
            <div className="mt-4 space-y-3">
  
  
              <p>
                Amount:
                <b> {booking.payment.amount}</b>
              </p>
  
  
              <p>
                Mode:
                {booking.payment.mode}
              </p>
  
  
              <p>
                Status:
                {booking.payment.status}
              </p>
  
  
              <p>
                Transaction ID:
                {booking.payment.transaction}
              </p>
  
  
            </div>
  
  
          </div>
  
  
        </div>
  
  
  
  
        {/* Admin Notes */}
  
        <div className="rounded-2xl bg-white p-6 shadow-sm">
  
          <h2 className="text-lg font-bold text-homigo-primary">
            Admin Notes
          </h2>
  
          <textarea
            placeholder="Add internal notes..."
            className="
            mt-4
            h-28
            w-full
            rounded-xl
            border
            p-4
            outline-none
            "
          />
  
  
        </div>
  
  
  
      </div>
    );
  }