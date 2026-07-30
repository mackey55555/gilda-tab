import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { StaffTable } from "./staff-table";

export default async function StaffPage() {
  const me = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  // auth.users のメールを含むため、admin 限定の RPC 経由で取得する
  const { data: staff, error } = await supabase.rpc("staff_directory");

  return (
    <StaffTable
      currentStaffId={me.id}
      initialStaff={staff ?? []}
      loadError={error ? "スタッフ一覧を取得できませんでした" : null}
    />
  );
}
