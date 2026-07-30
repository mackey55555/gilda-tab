import { cache } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "./supabase/server";

export type CurrentStaff = {
  id: string;
  name: string;
  role: string;
  email: string | null;
};

/**
 * ログイン中のスタッフ。
 * layout と page の両方から呼ぶので、リクエスト単位で結果を共有する。
 */
export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id, name, role")
    .eq("id", user.id)
    .maybeSingle();

  // プロフィール行が無くても操作自体は RLS で守られているので、ログインは通す
  return {
    id: user.id,
    name: staff?.name ?? user.email ?? "スタッフ",
    role: staff?.role ?? "staff",
    email: user.email ?? null,
  };
});

export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

/**
 * /admin 配下の認可。proxy.ts は認証しか見ていないのでここで role を確認する。
 * DB 側も RLS と各 RPC で admin を要求しているため、これは UI 上のガード。
 */
export async function requireAdmin(): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (staff.role !== "admin") redirect("/floor");
  return staff;
}
