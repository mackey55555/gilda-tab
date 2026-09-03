import { requireStaff } from "@/lib/auth";
import { buildGuestSuggestions } from "@/lib/guest-suggestions";
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
        isAdmin={staff.role === "admin"}
        reopenTarget={staff.role === "admin" ? lastClosed : null}
      />
    );
  }

  const [
    { data: tabRows },
    { data: paymentRows },
    { data: products },
    { data: categories },
    { data: pastGuests },
  ] = await Promise.all([
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
      supabase
        .from("products")
        .select("id, name, price, category_id, serving_note")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("categories")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      // 客名の入力候補。専用テーブルは作らず既存の伝票から集計する
      supabase
        .from("tabs")
        .select("guest_name")
        .not("guest_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

  return (
    <TabList
      businessDayId={businessDay.id}
      businessDate={businessDay.date}
      staffName={staff.name}
      staffId={staff.id}
      isAdmin={staff.role === "admin"}
      products={products ?? []}
      categories={categories ?? []}
      guestSuggestions={buildGuestSuggestions(pastGuests ?? [])}
      initialTabs={(tabRows ?? [])
        .map(toTabSummary)
        .filter((tab): tab is NonNullable<typeof tab> => tab !== null)}
      initialPayments={(paymentRows ?? [])
        .map(toPaymentSummary)
        .filter((payment): payment is NonNullable<typeof payment> => payment !== null)}
    />
  );
}
