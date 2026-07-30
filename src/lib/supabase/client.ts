import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";

import { supabasePublicEnv } from "./env";

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let cached: BrowserClient | undefined;

/**
 * ブラウザ用クライアント。
 *
 * /floor の書き込み（伝票作成・注文追加）はここから直接行う。Server Action を挟むと
 * ラウンドトリップが増えて「注文追加を2タップ以内・即反映」を満たせないため。
 * 権限は RLS で担保している。
 *
 * GoTrue のインスタンスが複数生まれると警告が出るので単一化する。
 */
export function getSupabaseBrowserClient(): BrowserClient {
  if (!cached) {
    const { url, publishableKey } = supabasePublicEnv();
    cached = createBrowserClient<Database>(url, publishableKey);
  }
  return cached;
}
