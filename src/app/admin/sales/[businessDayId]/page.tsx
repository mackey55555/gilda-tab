import Link from "next/link";
import { notFound } from "next/navigation";

import { formatBusinessDate, formatYen, guestLabel } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ItemRow = {
  item_id: string | null;
  item_name: string | null;
  price: number | null;
  qty: number | null;
  amount: number | null;
  ordered_at: string | null;
  staff_name: string | null;
};

type TabGroup = {
  tabId: string;
  seq: number;
  guestName: string | null;
  status: string;
  items: ItemRow[];
  total: number;
};

export default async function BusinessDayDetailPage({
  params,
}: {
  params: Promise<{ businessDayId: string }>;
}) {
  const { businessDayId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: businessDay } = await supabase
    .from("business_days")
    .select("id, date, status, opened_at, closed_at")
    .eq("id", businessDayId)
    .maybeSingle();

  if (!businessDay) notFound();

  // 同じ営業日だけを取り出す（sales_items は期間指定なので from = to にする）
  const { data: rows } = await supabase.rpc("sales_items", {
    from_date: businessDay.date,
    to_date: businessDay.date,
  });

  const groups = new Map<string, TabGroup>();
  for (const row of rows ?? []) {
    const group = groups.get(row.tab_id) ?? {
      tabId: row.tab_id,
      seq: row.tab_seq,
      guestName: row.guest_name,
      status: row.tab_status,
      items: [],
      total: 0,
    };

    if (row.item_id) {
      group.items.push(row);
      group.total += row.amount ?? 0;
    }

    groups.set(row.tab_id, group);
  }

  const tabs = [...groups.values()].sort((a, b) => a.seq - b.seq);
  const total = tabs.reduce((sum, tab) => sum + tab.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/sales" className="text-sm text-ink-muted underline-offset-4 hover:underline">
          ← 売上集計
        </Link>
        <div className="mt-1 flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">
            {formatBusinessDate(businessDay.date)} の営業
            {businessDay.status === "open" && (
              <span className="ml-3 align-middle text-sm font-normal text-accent">営業中</span>
            )}
          </h1>
          <span className="text-2xl font-bold tabular-nums">{formatYen(total)}</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {tabs.length}枚の伝票 / 開店 {formatTime(businessDay.opened_at)}
          {businessDay.closed_at && ` / 閉店 ${formatTime(businessDay.closed_at)}`}
        </p>
      </div>

      {tabs.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-muted">この営業日に伝票はありません</p>
      )}

      <div className="flex flex-col gap-4">
        {tabs.map((tab) => (
          <section key={tab.tabId} className="rounded-xl border border-line">
            <header className="flex items-center justify-between border-b border-line px-4 py-2">
              <span className="font-bold">
                {guestLabel(tab.guestName, tab.seq)}
                <span className="ml-2 text-xs font-normal text-ink-muted">
                  {tab.status === "paid" ? "会計済み" : "未会計"}
                </span>
              </span>
              <span className="font-bold tabular-nums">{formatYen(tab.total)}</span>
            </header>

            {tab.items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">明細なし</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {tab.items.map((item) => (
                    <tr key={item.item_id} className="border-b border-line/50 last:border-0">
                      <td className="px-4 py-2 text-ink-muted tabular-nums">
                        {formatTime(item.ordered_at)}
                      </td>
                      <td className="px-4 py-2">{item.item_name}</td>
                      <td className="px-4 py-2 text-right text-ink-muted tabular-nums">
                        {formatYen(item.price ?? 0)} × {item.qty}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatYen(item.amount ?? 0)}
                      </td>
                      <td className="w-24 px-4 py-2 text-xs text-ink-muted">{item.staff_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}
