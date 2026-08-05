"use client";

import { AdminHeader } from "@/components/admin/AdminHeader";
import {
  AdminSidebar,
  useAdminSidebar,
} from "@/components/admin/AdminSidebar";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { mobileOpen, openMobile, closeMobile } = useAdminSidebar();

  return (
    <div className="min-h-screen overflow-x-hidden bg-homigo-bg">
      <AdminSidebar mobileOpen={mobileOpen} onClose={closeMobile} />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <AdminHeader onMenuClick={openMobile} />
        <main className="mx-auto w-full max-w-[1920px] flex-1 p-4 sm:p-5 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
