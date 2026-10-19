"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const adminLinks = [
  { href: "/admin", label: "Ringkasan" },
  { href: "/admin/kategori", label: "Kategori" },
  { href: "/admin/users", label: "User" },
  { href: "/admin/jadwal", label: "Jadwal" },
];

export default function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi Admin"
      className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-3 sm:px-8"
    >
      <Link
        href="/dashboard"
        className="mr-2 rounded px-3 py-2 font-semibold text-gray-600 hover:bg-gray-100 hover:text-black"
      >
        ← Dashboard
      </Link>
      {adminLinks.map(({ href, label }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded px-3 py-2 font-semibold transition-colors ${
              isActive
                ? "bg-blue-100 text-blue-800"
                : "text-gray-600 hover:bg-gray-100 hover:text-blue-700"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
