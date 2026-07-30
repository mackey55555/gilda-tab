import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * secret key を使うクライアント。**サーバ専用**。
 *
 * RLS を貫通するため、使用は「通常のクライアントでは原理的にできない操作」に限る。
 * 現在の用途はスタッフ追加（auth.users の作成）だけ。
 * それ以外の読み書きは publishable key + RLS で行うこと。
 *
 * SUPABASE_SECRET_KEY は NEXT_PUBLIC_ が付いていないためクライアントバンドルには
 * 入らないが、取り違えを早く検知できるよう明示的にも弾く。
 */
export function createSupabaseAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("secret key のクライアントはサーバでのみ使用できます");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY を .env.local に設定してください");
  }

  return createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
