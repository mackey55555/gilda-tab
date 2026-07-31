import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProductTable, type AdminProduct } from "./product-table";

export default async function ProductsPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: products }, { data: categories }, { data: usedRows }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, price, category_id, sort_order, is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    // 削除して良いかは「一度でも注文されたか」で決まる
    supabase.from("order_items").select("product_id").not("product_id", "is", null),
  ]);

  const usedIds = new Set((usedRows ?? []).map((row) => row.product_id));

  const rows: AdminProduct[] = (products ?? []).map((product) => ({
    ...product,
    used: usedIds.has(product.id),
  }));

  return <ProductTable initialProducts={rows} categories={categories ?? []} />;
}
