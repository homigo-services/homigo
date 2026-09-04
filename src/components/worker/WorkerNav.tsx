"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/worker/offers", label: "Offers" },
  { href: "/worker/bookings", label: "Bookings" },
  { href: "/worker/profile", label: "Profile" },
];

export function WorkerNav() {
  const pathname = usePathname();
  if (pathname === "/worker/login") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-lg">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 py-3 text-center text-sm font-medium ${
                active ? "text-emerald-700" : "text-zinc-600"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
