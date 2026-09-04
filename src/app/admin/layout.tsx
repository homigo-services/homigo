import type { Metadata } from "next";
import { AdminLayoutRouter } from "@/components/admin/AdminLayoutRouter";

export const metadata: Metadata = {
  title: "Admin Dashboard | Homigo",
  description: "Homigo admin dashboard for managing bookings, workers, and customers.",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AdminLayoutRouter>{children}</AdminLayoutRouter>;
}
