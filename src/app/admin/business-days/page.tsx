import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { BusinessDayTable, type AdminBusinessDay } from "./business-day-table";

export default async function BusinessDaysPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: days } = await supabase
    .from("business_days")
    .select("id, date, status, opened_at, closed_at")
    .order("date", { ascending: false });

  // 売上と伝票数は集計 RPC から取る（明細ベースで数えるため）
  const dates = (days ?? []).map((day) => day.date);
  const { data: sales } = dates.length
    ? await supabase.rpc("sales_by_day", {
        from_date: dates[dates.length - 1],
        to_date: dates[0],
      })
    : { data: [] };

  const byId = new Map((sales ?? []).map((row) => [row.business_day_id, row]));

  const rows: AdminBusinessDay[] = (days ?? []).map((day) => ({
    ...day,
    total: byId.get(day.id)?.total ?? 0,
    tabCount: byId.get(day.id)?.tab_count ?? 0,
  }));

  return <BusinessDayTable initialDays={rows} />;
}
