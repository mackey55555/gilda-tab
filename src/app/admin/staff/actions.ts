"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateStaffState = { error: string | null; createdEmail: string | null };

/**
 * スタッフを追加する。
 *
 * auth.users の作成は通常のクライアントからはできないため、ここだけ secret key を使う。
 * 招待メール（inviteUserByEmail）ではなく初期パスワードでの直接作成にしているのは、
 * SMTP 設定なしで運用を始められるようにするため。パスワードは口頭で渡す想定。
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

/**
 * スタッフの有効/無効を切り替える。
 *
 * staff.is_active は画面の出し分け用で、実際にログインを止めるには auth 側の ban が要る。
 * 片方だけだと「一覧では無効なのにログインできる」状態になるので必ず対で更新する。
 */
export async function setStaffActive(
  targetStaffId: string,
  active: boolean,
): Promise<{ error: string | null }> {
  await requireAdmin();

  // 自分自身や最後の管理者を無効化できないことは RPC 側で判定する
  const supabase = await createSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("set_staff_active", {
    target_staff_id: targetStaffId,
    active,
  });

  if (rpcError) return { error: rpcError.message };

  const admin = createSupabaseAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(targetStaffId, {
    ban_duration: active ? "none" : "876000h",
  });

  if (banError) {
    // ログインを止められないなら中途半端な状態を残さず元に戻す
    await supabase.rpc("set_staff_active", { target_staff_id: targetStaffId, active: !active });
    return { error: `ログイン状態を更新できませんでした: ${banError.message}` };
  }

  revalidatePath("/admin/staff");
  return { error: null };
}

export async function renameStaff(
  targetStaffId: string,
  name: string,
): Promise<{ error: string | null }> {
  await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) return { error: "名前を入力してください" };

  // 管理者が他人の name を更新できるよう、列権限のある secret key 経由で行う
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("staff").update({ name: trimmed }).eq("id", targetStaffId);

  if (error) return { error: "名前を変更できませんでした" };

  revalidatePath("/admin/staff");
  return { error: null };
}
