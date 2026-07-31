import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CategoryTable, type AdminCategory } from "./category-table";

export default async function CategoriesPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("products").select("category_id"),
  ]);

  const counts = new Map<string, number>();
  for (const product of products ?? []) {
    if (!product.category_id) continue;
    counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
  }

  const rows: AdminCategory[] = (categories ?? []).map((category) => ({
    ...category,
    productCount: counts.get(category.id) ?? 0,
  }));

  return <CategoryTable initialCategories={rows} />;
}
