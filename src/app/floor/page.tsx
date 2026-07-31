import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toPaymentSummary, toTabSummary } from "@/lib/types";

import { OpenDayPanel } from "./open-day-panel";
import { TabList } from "./tab-list";

export default async function FloorPage() {
  const staff = await requireStaff();
  const supabase = await createSupabaseServerClient();

  const { data: businessDay } = await supabase
    .from("business_days")
    .select("id, date")
    .eq("status", "open")
    .maybeSingle();

  if (!businessDay) {
    // 誤ってクローズした場合に同じ晩へ戻れるよう、直近の営業日を管理者にだけ提示する
    const { data: lastClosed } = await supabase
      .from("business_days")
      .select("id, date")
      .eq("status", "closed")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    return (
      <OpenDayPanel
        staffName={staff.name}
        reopenTarget={staff.role === "admin" ? lastClosed : null}
      />
    );
  }

  const [{ data: tabRows }, { data: paymentRows }] = await Promise.all([
    supabase
      .from("tab_summaries")
      .select("*")
      .eq("business_day_id", businessDay.id)
      .eq("status", "open")
      .order("created_at", { ascending: true }),
    supabase
      .from("payment_summaries")
      .select("*")
      .eq("business_day_id", businessDay.id)
      .order("paid_at", { ascending: false }),
  ]);

  const initialTabs = (tabRows ?? [])
    .map(toTabSummary)
    .filter((tab): tab is NonNullable<typeof tab> => tab !== null);

  const initialPayments = (paymentRows ?? [])
    .map(toPaymentSummary)
    .filter((payment): payment is NonNullable<typeof payment> => payment !== null);

  return (
    <TabList
      businessDayId={businessDay.id}
      businessDate={businessDay.date}
      staffName={staff.name}
      initialTabs={initialTabs}
      initialPayments={initialPayments}
    />
  );
}
