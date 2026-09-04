"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";

interface AdminHeaderProps {
  onMenuClick: () => void;
}

export function AdminHeader({ onMenuClick }: AdminHeaderProps) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    setProfileOpen(false);
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="flex min-h-14 items-center justify-between gap-2 px-3 sm:min-h-16 sm:gap-4 sm:px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Open menu"
            onClick={onMenuClick}
            className="touch-target inline-flex shrink-0 items-center justify-center rounded-xl text-homigo-primary transition-colors hover:bg-slate-100 lg:hidden"
          >
            <AdminIcon name="menu" className="h-6 w-6" />
          </button>

          <div className="min-w-0 truncate">
            <p className="truncate text-xs text-slate-500 sm:text-sm">
              Welcome back,
            </p>
            <p className="truncate text-sm font-semibold text-homigo-primary sm:text-base">
              Admin User
            </p>
          </div>
        </div>

        <div className="relative mx-2 hidden min-w-0 max-w-md flex-1 lg:block xl:mx-4">
          <AdminIcon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            placeholder="Search bookings, customers, workers..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-homigo-primary outline-none transition-all placeholder:text-slate-400 focus:border-homigo-secondary focus:bg-white focus:ring-2 focus:ring-homigo-secondary/20"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
          <button
            type="button"
            aria-label="Notifications"
            className="touch-target relative inline-flex items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-homigo-primary"
          >
            <AdminIcon name="bell" className="h-5 w-5" />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-homigo-accent ring-2 ring-white" />
          </button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              aria-label="Profile menu"
              onClick={() => setProfileOpen((prev) => !prev)}
              className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-1 pl-1 pr-2 transition-all hover:border-slate-300 hover:shadow-sm sm:gap-2 sm:pr-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-homigo-secondary text-xs font-bold text-white sm:h-9 sm:w-9">
                AU
              </div>
              <span className="hidden text-sm font-medium text-homigo-primary md:block">
                Admin
              </span>
              <AdminIcon
                name="chevron"
                className={cn(
                  "hidden h-4 w-4 text-slate-400 transition-transform md:block",
                  profileOpen && "rotate-180",
                )}
              />
            </button>

            {profileOpen && (
              <div className="absolute right-0 z-50 mt-2 w-44 rounded-2xl border border-slate-200 bg-white py-1 shadow-lg sm:w-48">
                <button
                  type="button"
                  className="block min-h-11 w-full px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50"
                >
                  My Profile
                </button>
                <button
                  type="button"
                  className="block min-h-11 w-full px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Account Settings
                </button>
                <hr className="my-1 border-slate-100" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block min-h-11 w-full px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-3 pb-3 lg:hidden">
        <div className="relative">
          <AdminIcon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            placeholder="Search..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-homigo-primary outline-none placeholder:text-slate-400 focus:border-homigo-secondary focus:ring-2 focus:ring-homigo-secondary/20"
          />
        </div>
      </div>
    </header>
  );
}
