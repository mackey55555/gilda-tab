"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CreateStaffState = { error: string | null; createdEmail: string | null };

/**
 * スタッフを追加する。
 *
 * auth.users の作成は通常のクライアントからはできないため、ここだけ secret key を使う。
 * 招待メール（inviteUserByEmail）ではなく初期パスワードでの直接作成にしているのは、
 * SMTP 設定なしで運用を始められるようにするため。パスワードは口頭で渡す想定。
 *
 * staff プロフィール行は auth.users の insert トリガが自動で作る。
 */
export async function createStaff(
  _prevState: CreateStaffState,
  formData: FormData,
): Promise<CreateStaffState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !password || !name) {
    return { error: "名前・メールアドレス・初期パスワードをすべて入力してください", createdEmail: null };
  }

  if (password.length < 8) {
    return { error: "初期パスワードは 8 文字以上にしてください", createdEmail: null };
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) {
    return {
      error:
        error.status === 422
          ? "このメールアドレスは既に登録されています"
          : `スタッフを追加できませんでした: ${error.message}`,
      createdEmail: null,
    };
  }

  revalidatePath("/admin/staff");
  return { error: null, createdEmail: email };
}
