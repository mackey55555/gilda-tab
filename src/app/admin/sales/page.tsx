import Link from "next/link";

import { formatBusinessDate, formatYen } from "@/lib/format";
import { buildGuestRanking } from "@/lib/guest-ranking";
import { hourLabel, resolvePeriod } from "@/lib/sales";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { BarChart } from "./bar-chart";
import { PeriodPicker } from "./period-picker";
import { GuestRanking } from "./guest-ranking";
import { ProductRanking } from "./product-ranking";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params);
  const supabase = await createSupabaseServerClient();

  const range = { from_date: period.from, to_date: period.to };
  const [daily, byProduct, byHour, items] = await Promise.all([
    supabase.rpc("sales_by_day", range),
    supabase.rpc("sales_by_product", range),
    supabase.rpc("sales_by_hour", range),
    // 客別は専用の集計関数を作らず、明細から組み立てる
    supabase.rpc("sales_items", range),
  ]);

  const days = daily.data ?? [];
  const products = byProduct.data ?? [];
  const hours = byHour.data ?? [];

  const total = days.reduce((sum, day) => sum + day.total, 0);
  const tabCount = days.reduce((sum, day) => sum + day.tab_count, 0);
  const openDays = days.filter((day) => day.tab_count > 0).length;
  const avgPerTab = tabCount === 0 ? 0 : Math.round(total / tabCount);
  const avgPerDay = openDays === 0 ? 0 : Math.round(total / openDays);

  const exportQuery = `from=${period.from}&to=${period.to}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">売上集計</h1>
        <PeriodPicker period={period} />
      </div>

      {daily.error && (
        <p role="alert" className="text-sm text-danger">
          集計を取得できませんでした: {daily.error.message}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="売上" value={formatYen(total)} />
        <SummaryCard label="営業日数" value={`${openDays}日`} />
        <SummaryCard label="伝票枚数" value={`${tabCount}枚`} />
        <SummaryCard label="客単価" value={formatYen(avgPerTab)} hint={`1営業日 ${formatYen(avgPerDay)}`} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">日別売上</h2>
          <div className="flex gap-2 text-xs">
            <ExportLink href={`/admin/sales/export?type=daily&${exportQuery}`} label="日別 CSV" />
            <ExportLink href={`/admin/sales/export?type=product&${exportQuery}`} label="商品別 CSV" />
            <ExportLink href={`/admin/sales/export?type=items&${exportQuery}`} label="明細 CSV" />
          </div>
        </div>

        <BarChart
          bars={days.map((day) => ({
            key: day.business_day_id,
            label: formatBusinessDate(day.business_date),
            value: day.total,
            sublabel: `伝票${day.tab_count}枚`,
          }))}
          labelEvery={days.length > 10 ? 2 : 1}
          emptyMessage="この期間に営業日がありません"
        />

        {days.length > 0 && (
          <table className="w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="px-3 py-1 font-normal">営業日</th>
                <th className="w-24 px-3 py-1 text-right font-normal">伝票</th>
                <th className="w-24 px-3 py-1 text-right font-normal">明細</th>
                <th className="w-32 px-3 py-1 text-right font-normal">客単価</th>
                <th className="w-36 px-3 py-1 text-right font-normal">売上</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.business_day_id}>
                  <td className="rounded-l-lg bg-surface px-3 py-2">
                    <Link
                      href={`/admin/sales/${day.business_day_id}`}
                      className="font-bold underline-offset-4 hover:underline"
                    >
                      {formatBusinessDate(day.business_date)}
                    </Link>
                    {day.status === "open" && (
                      <span className="ml-2 text-xs text-accent">営業中</span>
                    )}
                  </td>
                  <td className="bg-surface px-3 py-2 text-right tabular-nums">{day.tab_count}</td>
                  <td className="bg-surface px-3 py-2 text-right tabular-nums">{day.item_count}</td>
                  <td className="bg-surface px-3 py-2 text-right tabular-nums text-ink-muted">
                    {formatYen(day.avg_per_tab)}
                  </td>
                  <td className="rounded-r-lg bg-surface px-3 py-2 text-right font-bold tabular-nums">
                    {formatYen(day.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">時間帯別売上</h2>
        <p className="text-xs text-ink-muted">
          24 時以降は 24 時台・25 時台として営業の流れ通りに並べています。
        </p>
        <BarChart
          bars={hours.map((row) => ({
            key: String(row.hour),
            label: hourLabel(row.hour),
            value: row.total,
            sublabel: `${row.qty}点`,
          }))}
          emptyMessage="この期間に注文がありません"
        />
      </section>

      <ProductRanking rows={products} />

      <GuestRanking rows={buildGuestRanking(items.data ?? [])} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="rounded border border-line px-2 py-1 text-ink-muted hover:bg-surface">
      {label}
    </a>
  );
}
