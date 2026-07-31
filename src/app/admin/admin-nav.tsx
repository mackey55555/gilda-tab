"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/sales", label: "売上集計" },
  { href: "/admin/products", label: "商品マスタ" },
  { href: "/admin/categories", label: "カテゴリ" },
  { href: "/admin/staff", label: "スタッフ" },
  { href: "/admin/business-days", label: "営業日" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm ${
              active ? "bg-raised font-bold text-ink" : "text-ink-muted hover:bg-surface"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
