import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { resolvePeriod } from "@/lib/sales";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Excel が UTF-8 と判定できるよう BOM を付ける（付けないと日本語が文字化けする）。
 * 不可視文字をソースに直接置くと気付かず消えるので、必ずエスケープで書く。
 */
const BOM = "\uFEFF";

function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const escape = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return (
    BOM +
    [header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n") +
    "\r\n"
  );
}

function csvResponse(filename: string, body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  await requireAdmin();

  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") ?? "daily";
  const period = resolvePeriod({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const supabase = await createSupabaseServerClient();
  const range = { from_date: period.from, to_date: period.to };
  const suffix = `${period.from}_${period.to}`;

  if (type === "product") {
    const { data, error } = await supabase.rpc("sales_by_product", range);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return csvResponse(
      `gilda_商品別_${suffix}.csv`,
      toCsv(
        ["商品名", "カテゴリ", "数量", "売上"],
        (data ?? []).map((row) => [row.name, row.category, row.qty, row.total]),
      ),
    );
  }

  if (type === "items") {
    const { data, error } = await supabase.rpc("sales_items", range);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return csvResponse(
      `gilda_明細_${suffix}.csv`,
      toCsv(
        ["営業日", "伝票番号", "客名", "会計状態", "注文時刻", "商品名", "カテゴリ", "単価", "数量", "金額", "担当"],
        (data ?? []).map((row) => [
          row.business_date,
          row.tab_seq,
          row.guest_name,
          row.tab_status === "paid" ? "会計済み" : "未会計",
          row.ordered_at
            ? new Date(row.ordered_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
            : null,
          row.item_name,
          row.category,
          row.price,
          row.qty,
          row.amount,
          row.staff_name,
        ]),
      ),
    );
  }

  const { data, error } = await supabase.rpc("sales_by_day", range);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return csvResponse(
    `gilda_日別_${suffix}.csv`,
    toCsv(
      ["営業日", "状態", "伝票枚数", "明細数", "客単価", "売上"],
      (data ?? []).map((row) => [
        row.business_date,
        row.status === "open" ? "営業中" : "クローズ",
        row.tab_count,
        row.item_count,
        row.avg_per_tab,
        row.total,
      ]),
    ),
  );
}
