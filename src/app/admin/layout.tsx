import Link from "next/link";

import { requireAdmin } from "@/lib/auth";

import { SignOutButton } from "../floor/sign-out-button";

import { AdminNav } from "./admin-nav";

/**
 * 管理画面は PC 前提のサイドバー構成。
 * 営業用（/floor）とは UI を共有せず、レイアウトもコンポーネントも別系統にする。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireAdmin();

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-line bg-surface px-4 py-5">
        <div>
          <span className="text-lg font-bold tracking-widest text-accent">gilda</span>
          <p className="text-xs text-ink-muted">管理</p>
        </div>

        <AdminNav />

        <div className="mt-auto flex flex-col gap-1 text-xs text-ink-muted">
          <Link href="/floor" className="rounded-lg px-3 py-2 hover:bg-raised">
            ← 営業画面へ
          </Link>
          <SignOutButton staffName={staff.name} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
