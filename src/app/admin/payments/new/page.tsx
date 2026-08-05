export default function RecordPaymentPage() {
    return (
      <div className="min-h-screen bg-slate-100 p-8">
  
        {/* Header */}
  
        <div className="mb-8">
  
          <h1 className="text-4xl font-bold text-blue-950">
            Record Payment
          </h1>
  
          <p className="mt-2 text-slate-500">
            Create a new payment entry for completed booking.
          </p>
  
        </div>
  
        <div className="grid grid-cols-2 gap-8">
  
          {/* Left */}
  
          <div className="rounded-2xl bg-white p-6 shadow">
  
            <h2 className="mb-6 text-2xl font-bold">
              Booking Information
            </h2>
  
            <div className="space-y-5">
  
              <Input label="Booking ID" />
              <Input label="Customer Name" />
              <Input label="Worker Name" />
              <Input label="Service" />
              <Input label="Booking Date" />
  
            </div>
  
          </div>
  
          {/* Right */}
  
          <div className="rounded-2xl bg-white p-6 shadow">
  
            <h2 className="mb-6 text-2xl font-bold">
              Payment Information
            </h2>
  
            <div className="space-y-5">
  
              <Input label="Amount" />
  
              <Input label="Commission" />
  
              <Input label="Worker Receives" />
  
              <div>
  
                <label className="mb-2 block font-medium">
                  Payment Mode
                </label>
  
                <select className="w-full rounded-xl border border-slate-300 px-4 py-3">
  
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Card</option>
                  <option>Net Banking</option>
  
                </select>
  
              </div>
  
              <Input label="Transaction ID" />
  
              <div>
  
                <label className="mb-2 block font-medium">
                  Status
                </label>
  
                <select className="w-full rounded-xl border border-slate-300 px-4 py-3">
  
                  <option>Completed</option>
                  <option>Pending</option>
                  <option>Failed</option>
                  <option>Refunded</option>
  
                </select>
  
              </div>
  
            </div>
  
          </div>
  
        </div>
  
        {/* Notes */}
  
        <div className="mt-8 rounded-2xl bg-white p-6 shadow">
  
          <h2 className="mb-5 text-2xl font-bold">
            Notes
          </h2>
  
          <textarea
            rows={5}
            className="w-full rounded-xl border border-slate-300 p-4"
            placeholder="Additional payment remarks..."
          />
  
        </div>
  
        {/* Buttons */}
  
        <div className="mt-8 flex justify-end gap-4">
  
          <button className="rounded-xl border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-100">
            Cancel
          </button>
  
          <button className="rounded-xl bg-blue-900 px-8 py-3 font-semibold text-white hover:bg-blue-800">
            Save Payment
          </button>
  
        </div>
  
      </div>
    );
  }
  
  function Input({ label }: { label: string }) {
    return (
      <div>
  
        <label className="mb-2 block font-medium">
          {label}
        </label>
  
        <input
          type="text"
          className="w-full rounded-xl border border-slate-300 px-4 py-3"
        />
  
      </div>
    );
  }