import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toTabSummary } from "@/lib/types";

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
    return <OpenDayPanel staffName={staff.name} />;
  }

  const { data: rows } = await supabase
    .from("tab_summaries")
    .select("*")
    .eq("business_day_id", businessDay.id)
    .eq("status", "open")
    .order("created_at", { ascending: true });

  const initialTabs = (rows ?? [])
    .map(toTabSummary)
    .filter((tab): tab is NonNullable<typeof tab> => tab !== null);

  return (
    <TabList
      businessDayId={businessDay.id}
      businessDate={businessDay.date}
      staffName={staff.name}
      initialTabs={initialTabs}
    />
  );
}
