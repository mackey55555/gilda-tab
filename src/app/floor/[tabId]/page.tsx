import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { TabDetail } from "./tab-detail";

export default async function TabPage({
  params,
}: {
  params: Promise<{ tabId: string }>;
}) {
  const { tabId } = await params;
  const staff = await requireStaff();
  const supabase = await createSupabaseServerClient();

  const { data: tab } = await supabase
    .from("tabs")
    .select("id, seq, guest_name, status, business_day_id")
    .eq("id", tabId)
    .maybeSingle();

  if (!tab) notFound();

  const [{ data: businessDay }, { data: items }, { data: products }] = await Promise.all([
    supabase.from("business_days").select("status").eq("id", tab.business_day_id).maybeSingle(),
    supabase
      .from("order_items")
      .select("id, product_id, name_snapshot, price_snapshot, qty, created_at")
      .eq("tab_id", tabId)
      .order("created_at", { ascending: true }),
    supabase
      .from("products")
      .select("id, name, price, category")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  return (
    <TabDetail
      tabId={tab.id}
      seq={tab.seq}
      initialGuestName={tab.guest_name}
      initialItems={items ?? []}
      products={products ?? []}
      staffId={staff.id}
      // 会計済みの伝票と、クローズ済み営業日の伝票は編集させない（RLS 側でも弾かれる）
      editable={tab.status === "open" && businessDay?.status === "open"}
      paid={tab.status === "paid"}
    />
  );
}
