"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null };

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/floor");

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // 認証エラーの詳細はユーザーに見せない（アカウントの存在が分かってしまう）
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }

  // オープンリダイレクト防止のため、アプリ内パスだけを許可する
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/floor");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
