/**
 * Supabase の公開接続情報。
 *
 * キーは新形式（publishable）のみを使う。legacy の anon key は使わない。
 * secret key（sb_secret_...）はサーバ専用なのでここでは一切参照しない。
 *
 * NEXT_PUBLIC_* はビルド時にインライン展開されるため、process.env の参照は
 * 変数越しではなくリテラルで書く必要がある。
 */
export function supabasePublicEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を .env.local に設定してください",
    );
  }

  return { url, publishableKey };
}
