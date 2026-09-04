import type { Metadata, Viewport } from "next";
import { WorkerNav } from "@/components/worker/WorkerNav";

export const metadata: Metadata = {
  title: "Homigo Worker",
  description: "Homigo worker app — service requests and bookings",
  manifest: "/worker-manifest.json",
  appleWebApp: {
    capable: true,
    title: "Homigo Worker",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 pb-20">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-emerald-800">Homigo Worker</h1>
      </header>
      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
      <WorkerNav />
    </div>
  );
}
