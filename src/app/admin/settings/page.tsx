export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-slate-100 p-8">

      {/* Header */}

      <div className="mb-8">

        <h1 className="text-4xl font-bold text-blue-950">
          Settings
        </h1>

        <p className="mt-2 text-slate-500">
          Configure Homigo platform settings.
        </p>

      </div>

      {/* Company */}

      <div className="mb-8 rounded-2xl bg-white p-6 shadow">

        <h2 className="mb-6 text-2xl font-bold">
          Company Settings
        </h2>

        <div className="grid grid-cols-2 gap-6">

          <Input label="Company Name" value="Homigo" />

          <Input label="Support Email" value="support@homigo.in" />

          <Input label="Support Phone" value="+91 9876543210" />

          <Input label="GST Number" value="27ABCDE1234F1Z5" />

        </div>

        <div className="mt-6">

          <label className="mb-2 block font-medium">
            Company Address
          </label>

          <textarea
            rows={4}
            className="w-full rounded-xl border border-slate-300 p-4"
            defaultValue="Pune, Maharashtra"
          />

        </div>

      </div>

      {/* Business */}

      <div className="mb-8 rounded-2xl bg-white p-6 shadow">

        <h2 className="mb-6 text-2xl font-bold">
          Business Settings
        </h2>

        <div className="grid grid-cols-2 gap-6">

          <Input label="Default Commission (%)" value="20" />

          <Input label="Minimum Booking Amount" value="199" />

          <Input label="Cancellation Charge" value="50" />

          <Input label="OTP Length" value="4" />

        </div>

      </div>

      {/* Notifications */}

      <div className="mb-8 rounded-2xl bg-white p-6 shadow">

        <h2 className="mb-6 text-2xl font-bold">
          Notification Settings
        </h2>

        <div className="space-y-5">

          <Toggle title="Email Notifications" />

          <Toggle title="SMS Notifications" />

          <Toggle title="WhatsApp Notifications" />

        </div>

      </div>

      {/* Admin */}

      <div className="mb-8 rounded-2xl bg-white p-6 shadow">

        <h2 className="mb-6 text-2xl font-bold">
          Admin Profile
        </h2>

        <div className="grid grid-cols-2 gap-6">

          <Input label="Admin Name" value="Admin" />

          <Input label="Email" value="admin@homigo.in" />

          <Input label="New Password" value="" />

          <Input label="Confirm Password" value="" />

        </div>

      </div>

      {/* System */}

      <div className="rounded-2xl bg-white p-6 shadow">

        <h2 className="mb-6 text-2xl font-bold">
          System
        </h2>

        <div className="flex flex-wrap gap-4">

          <button className="rounded-xl bg-blue-900 px-6 py-3 font-semibold text-white hover:bg-blue-800">
            Save Settings
          </button>

          <button className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700">
            Backup Database
          </button>

          <button className="rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600">
            Export Data
          </button>

          <button className="rounded-xl bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700">
            Logout
          </button>

        </div>

      </div>

    </div>
  );
}

function Input({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <label className="mb-2 block font-medium">
        {label}
      </label>

      <input
        defaultValue={value}
        className="w-full rounded-xl border border-slate-300 px-4 py-3"
      />
    </div>
  );
}

function Toggle({
  title,
}: {
  title: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">

      <span className="font-medium">
        {title}
      </span>

      <input type="checkbox" defaultChecked className="h-5 w-5" />

    </div>
  );
}