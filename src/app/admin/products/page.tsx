import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProductTable, type AdminProduct } from "./product-table";

export default async function ProductsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, category, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  // 削除して良いかは「一度でも注文されたか」で決まる。全件分をまとめて引く。
  const { data: usedRows } = await supabase
    .from("order_items")
    .select("product_id")
    .not("product_id", "is", null);

  const usedIds = new Set((usedRows ?? []).map((row) => row.product_id));

  const rows: AdminProduct[] = (products ?? []).map((product) => ({
    ...product,
    used: usedIds.has(product.id),
  }));

  return <ProductTable initialProducts={rows} />;
}
