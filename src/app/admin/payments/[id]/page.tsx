export default function PaymentDetailsPage() {
    const payment = {
      paymentId: "PAY001",
      bookingId: "HG-B001",
      customer: "Amit Sharma",
      worker: "Ramesh Patil",
      service: "Electrician",
      address: "Baner, Pune",
      bookingDate: "30 Jul 2026",
      paymentDate: "30 Jul 2026",
      paymentMode: "UPI",
      transactionId: "UPI45896521458",
      amount: "₹500",
      commission: "₹100",
      workerGets: "₹400",
      status: "Completed",
      otp: "4582",
      remarks: "Work completed successfully",
    };
  
    return (
      <div className="min-h-screen bg-slate-100 p-8">
  
        {/* Header */}
  
        <div className="mb-8 flex items-center justify-between">
  
          <div>
  
            <h1 className="text-4xl font-bold text-blue-950">
              Payment Details
            </h1>
  
            <p className="mt-2 text-slate-500">
              Complete payment information.
            </p>
  
          </div>
  
          <div className="flex gap-4">
  
            <button className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700">
              Print Receipt
            </button>
  
            <button className="rounded-xl bg-blue-900 px-6 py-3 font-semibold text-white hover:bg-blue-800">
              Download Invoice
            </button>
  
          </div>
  
        </div>
  
        {/* Payment Info */}
  
        <div className="grid grid-cols-2 gap-6">
  
          <div className="rounded-2xl bg-white p-6 shadow">
  
            <h2 className="mb-5 text-2xl font-bold">
              Payment Information
            </h2>
  
            <div className="space-y-4">
  
              <Row label="Payment ID" value={payment.paymentId} />
              <Row label="Booking ID" value={payment.bookingId} />
              <Row label="Payment Mode" value={payment.paymentMode} />
              <Row label="Transaction ID" value={payment.transactionId} />
              <Row label="Payment Date" value={payment.paymentDate} />
              <Row label="Status" value={payment.status} />
  
            </div>
  
          </div>
  
          <div className="rounded-2xl bg-white p-6 shadow">
  
            <h2 className="mb-5 text-2xl font-bold">
              Booking Information
            </h2>
  
            <div className="space-y-4">
  
              <Row label="Customer" value={payment.customer} />
              <Row label="Worker" value={payment.worker} />
              <Row label="Service" value={payment.service} />
              <Row label="Address" value={payment.address} />
              <Row label="Booking Date" value={payment.bookingDate} />
              <Row label="OTP Used" value={payment.otp} />
  
            </div>
  
          </div>
  
        </div>
  
        {/* Amount */}
  
        <div className="mt-8 rounded-2xl bg-white p-6 shadow">
  
          <h2 className="mb-5 text-2xl font-bold">
            Payment Summary
          </h2>
  
          <div className="grid grid-cols-3 gap-6">
  
            <Card title="Amount Paid" value={payment.amount} />
  
            <Card title="Homigo Commission" value={payment.commission} />
  
            <Card title="Worker Receives" value={payment.workerGets} />
  
          </div>
  
        </div>
  
        {/* Remarks */}
  
        <div className="mt-8 rounded-2xl bg-white p-6 shadow">
  
          <h2 className="mb-4 text-2xl font-bold">
            Remarks
          </h2>
  
          <p className="text-slate-600">
            {payment.remarks}
          </p>
  
        </div>
  
      </div>
    );
  }
  
  function Row({
    label,
    value,
  }: {
    label: string;
    value: string;
  }) {
    return (
      <div className="flex justify-between border-b pb-2">
  
        <span className="font-medium text-slate-500">
          {label}
        </span>
  
        <span className="font-semibold">
          {value}
        </span>
  
      </div>
    );
  }
  
  function Card({
    title,
    value,
  }: {
    title: string;
    value: string;
  }) {
    return (
      <div className="rounded-xl border p-6 text-center">
  
        <p className="text-slate-500">
          {title}
        </p>
  
        <h3 className="mt-3 text-4xl font-bold text-blue-950">
          {value}
        </h3>
  
      </div>
    );
  }