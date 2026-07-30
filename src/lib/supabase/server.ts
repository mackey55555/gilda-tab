import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";

import { supabasePublicEnv } from "./env";

/**
 * Server Component / Server Action 用クライアント。
 *
 * Next.js 16 では cookies() が非同期なので await して渡す。
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component のレンダリング中は Cookie を書き込めない（Next.js の制約）。
          // アクセストークンの更新と書き戻しは proxy.ts が担うので、ここでは無視して良い。
        }
      },
    },
  });
}
