import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { supabasePublicEnv } from "./supabase/env";

type ReceiptRow = Database["public"]["Functions"]["get_receipt"]["Returns"][number];

/**
 * お客様向けの領収書。
 *
 * 型生成は returns table の列をすべて非 null にするが、未確定のあいだは number / addressee が null、
 * 店舗に登録番号がなければ registration_number が null になるため、その 3 列だけ上書きする。
 */
export type Receipt = Omit<ReceiptRow, "number" | "addressee" | "registration_number"> & {
  number: string | null;
  addressee: string | null;
  registration_number: string | null;
};

/** 確定済みの領収書。PDF はこれだけを対象にする。 */
export type FinalizedReceipt = Receipt & { finalized: true; number: string; addressee: string };

export function isFinalized(receipt: Receipt): receipt is FinalizedReceipt {
  return receipt.finalized && receipt.number !== null && receipt.addressee !== null;
}

/**
 * トークンから領収書を取得する。見つからない・期限切れ・取り消し済みはどれも null。
 *
 * お客様はログインしていないので、Cookie を扱わない素のクライアントを使う（anon として RPC を呼ぶ）。
 * スタッフが同じ端末で開いた場合もセッションを持ち込まず、お客様と同じ見え方にするため。
 */
export async function fetchReceipt(token: string): Promise<Receipt | null> {
  // トークンは 64 桁の 16 進。形式が違うものは DB に問い合わせるまでもない
  if (!/^[0-9a-f]{64}$/.test(token)) return null;

  const { url, publishableKey } = supabasePublicEnv();
  const supabase = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("get_receipt", { receipt_token: token });
  if (error) throw new Error(`領収書を取得できませんでした: ${error.message}`);

  return (data?.[0] as Receipt | undefined) ?? null;
}

/**
 * 宛名と敬称を分けて返す。
 * 「上様」や、お客様が自分で「様」「御中」まで書いた場合に「様」を重ねないため。
 */
export function splitAddressee(addressee: string): { name: string; honorific: string | null } {
  if (addressee === "上様" || /(様|御中|殿)$/.test(addressee)) {
    return { name: addressee, honorific: null };
  }
  return { name: addressee, honorific: "様" };
}

/** 2026-11-05 → 2026年11月5日 */
export function formatReceiptDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export const RECEIPT_PURPOSE = "飲食代として";
