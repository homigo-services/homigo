"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { navItems } from "@/lib/admin-data";
import { cn } from "@/lib/cn";

interface AdminSidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function AdminSidebar({ mobileOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-homigo-primary/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(100%,280px)] flex-col bg-homigo-primary text-white shadow-xl transition-transform duration-300 sm:w-64 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4 sm:h-16 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-homigo-accent text-sm font-bold text-white">
              H
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-tight sm:text-lg">
                Homigo
              </p>
              <p className="text-xs text-white/50">Admin Panel</p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <AdminIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3 sm:py-4">
          {navItems.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <AdminIcon name={item.icon} className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white"
          >
            <AdminIcon name="logout" className="h-5 w-5 shrink-0" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

export function useAdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return {
    mobileOpen,
    openMobile: () => setMobileOpen(true),
    closeMobile: () => setMobileOpen(false),
  };
}
