import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ShopForm } from "./shop-form";

export default async function ShopPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: shop } = await supabase
    .from("shop_settings")
    .select("name, address, phone, registration_number, updated_at")
    .single();

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <h1 className="text-2xl font-bold">店舗情報</h1>
      <p className="text-sm text-ink-muted">
        領収書の発行者欄に載る内容です。変更はこれから発行する領収書にだけ反映され、
        お客様が既に受け取った領収書は変わりません。
      </p>

      {shop ? (
        <ShopForm initial={shop} />
      ) : (
        <p role="alert" className="text-sm text-danger">
          店舗情報を読み込めませんでした
        </p>
      )}
    </div>
  );
}
