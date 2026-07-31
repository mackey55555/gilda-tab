"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { formatYen } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

import { SortableRows, useSortableRow } from "../sortable-rows";

import { ProductForm, type ProductDraft } from "./product-form";

export type AdminProduct = {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  sort_order: number;
  is_active: boolean;
  /** 一度でも注文されたか。使用済みは削除させず無効化に倒す。 */
  used: boolean;
};

type Filter = "active" | "all";

export function ProductTable({
  initialProducts,
  categories,
}: {
  initialProducts: AdminProduct[];
  categories: Category[];
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [filter, setFilter] = useState<Filter>("active");
  const [keyword, setKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const categoryName = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const visible = useMemo(() => {
    const trimmed = keyword.trim();
    return products.filter((product) => {
      const byFilter = filter === "all" || product.is_active;
      const byKeyword =
        trimmed === "" ||
        product.name.includes(trimmed) ||
        (product.category_id ? (categoryName.get(product.category_id) ?? "") : "未分類").includes(
          trimmed,
        );
      return byFilter && byKeyword;
    });
  }, [products, filter, keyword, categoryName]);

  // 並べ替えは全件を対象にする。絞り込み中に動かすと意図しない順序になるため止める。
  const sortable = filter === "active" && keyword.trim() === "" && !creating && editingId === null;

  function refresh() {
    startRefresh(() => router.refresh());
  }

  async function run(id: string | null, action: () => Promise<{ error: unknown }>) {
    setBusyId(id ?? "new");
    setError(null);

    const { error: actionError } = await action();
    setBusyId(null);

    if (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作に失敗しました");
      return false;
    }

    refresh();
    return true;
  }

  async function create(draft: ProductDraft) {
    const supabase = getSupabaseBrowserClient();
    const maxOrder = products.reduce((max, product) => Math.max(max, product.sort_order), 0);
    const ok = await run(null, async () =>
      supabase.from("products").insert({ ...draft, sort_order: maxOrder + 10 }),
    );
    if (ok) setCreating(false);
  }

  async function update(id: string, draft: ProductDraft) {
    const supabase = getSupabaseBrowserClient();
    const ok = await run(id, async () => supabase.from("products").update(draft).eq("id", id));
    if (ok) setEditingId(null);
  }

  async function toggleActive(product: AdminProduct) {
    const supabase = getSupabaseBrowserClient();
    await run(product.id, async () =>
      supabase.from("products").update({ is_active: !product.is_active }).eq("id", product.id),
    );
  }

  async function reorder(ids: string[]) {
    // 先に画面へ反映してからサーバに送る（ドラッグの手応えを損なわないため）
    const byId = new Map(products.map((product) => [product.id, product]));
    setProducts(ids.map((id) => byId.get(id)).filter((p): p is AdminProduct => p !== undefined));
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: rpcError } = await supabase.rpc("reorder_products", { product_ids: ids });

    if (rpcError) {
      setProducts(initialProducts);
      setError("並べ替えを保存できませんでした");
      return;
    }

    refresh();
  }

  async function remove(product: AdminProduct) {
    setBusyId(product.id);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    // RLS で弾かれた場合はエラーではなく 0 件になるので、消えた件数で判定する
    const { data, error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id)
      .select("id");

    setBusyId(null);

    if (deleteError || (data?.length ?? 0) === 0) {
      setError("削除できませんでした。注文実績のある商品は無効化してください。");
      return;
    }

    refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">商品マスタ</h1>
        <Link
          href="/admin/categories"
          className="rounded-lg border border-line px-3 py-1 text-sm text-ink-muted"
        >
          カテゴリを編集
        </Link>
      </div>

      <p className="text-sm text-ink-muted">
        表示順は営業画面の商品グリッドの並びです。行の左端を掴んで入れ替えられます。
        注文実績のある商品は削除できません（無効化すると営業画面から消えます）。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="商品名・カテゴリで検索"
          className="h-9 w-64 rounded-lg border border-line bg-raised px-3 outline-none focus:border-accent"
        />
        <div className="flex items-center gap-2">
          <FilterTab label="有効のみ" active={filter === "active"} onClick={() => setFilter("active")} />
          <FilterTab label="すべて" active={filter === "all"} onClick={() => setFilter("all")} />
        </div>
        <span className="text-xs text-ink-muted">
          {visible.length} / {products.length} 件
          {!sortable && "・絞り込み中は並べ替えできません"}
        </span>
      </div>

      {creating ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <ProductForm
            categories={categories}
            submitLabel="追加する"
            pending={busyId === "new"}
            onSubmit={create}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-ink"
        >
          ＋ 商品を追加
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 px-3 text-xs text-ink-muted">
          <span className="w-6" />
          <span className="flex-1">商品名</span>
          <span className="w-40">カテゴリ</span>
          <span className="w-28 text-right">価格</span>
          <span className="w-16">状態</span>
          <span className="w-56">操作</span>
        </div>

        {visible.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-ink-muted">該当する商品がありません</p>
        )}

        <SortableRows items={visible} onReorder={reorder} disabled={!sortable}>
          {(product) => (
            <ProductRow
              key={product.id}
              product={product}
              categoryName={
                product.category_id ? (categoryName.get(product.category_id) ?? "—") : "未分類"
              }
              categories={categories}
              sortable={sortable}
              busy={busyId === product.id || refreshing}
              editing={editingId === product.id}
              onEdit={() => setEditingId(product.id)}
              onCancelEdit={() => setEditingId(null)}
              onSubmitEdit={(draft) => void update(product.id, draft)}
              onToggleActive={() => void toggleActive(product)}
              onRemove={() => void remove(product)}
            />
          )}
        </SortableRows>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  categoryName,
  categories,
  sortable,
  busy,
  editing,
  onEdit,
  onCancelEdit,
  onSubmitEdit,
  onToggleActive,
  onRemove,
}: {
  product: AdminProduct;
  categoryName: string;
  categories: Category[];
  sortable: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (draft: ProductDraft) => void;
  onToggleActive: () => void;
  onRemove: () => void;
}) {
  const { setNodeRef, style, handleProps } = useSortableRow(product.id);

  if (editing) {
    return (
      <div className="rounded-xl bg-surface px-3 py-3">
        <ProductForm
          initial={{ name: product.name, price: product.price, category_id: product.category_id }}
          categories={categories}
          submitLabel="保存する"
          pending={busy}
          onSubmit={onSubmitEdit}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg bg-surface px-3 py-2 text-sm ${
        product.is_active ? "" : "opacity-50"
      }`}
    >
      <span
        {...(sortable ? handleProps : {})}
        aria-label="ドラッグして並べ替え"
        className={`w-6 select-none text-center text-ink-muted ${
          sortable ? "cursor-grab active:cursor-grabbing" : "opacity-30"
        }`}
      >
        ⠿
      </span>
      <span className="min-w-0 flex-1 truncate font-bold">{product.name}</span>
      <span className="w-40 truncate text-ink-muted">{categoryName}</span>
      <span className="w-28 text-right tabular-nums">{formatYen(product.price)}</span>
      <span className={`w-16 ${product.is_active ? "" : "text-ink-muted"}`}>
        {product.is_active ? "有効" : "無効"}
      </span>
      <span className="flex w-56 items-center gap-2">
        <RowButton label="編集" disabled={busy} onClick={onEdit} />
        <RowButton
          label={product.is_active ? "無効化" : "有効化"}
          disabled={busy}
          onClick={onToggleActive}
        />
        {product.used ? (
          <span className="text-xs text-ink-muted">注文実績あり</span>
        ) : (
          <RowButton label="削除" danger disabled={busy} onClick={onRemove} />
        )}
      </span>
    </div>
  );
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? "border-accent bg-accent font-bold text-accent-ink" : "border-line text-ink-muted"
      }`}
    >
      {label}
    </button>
  );
}

function RowButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-2 py-1 text-xs disabled:opacity-40 ${
        danger ? "border-danger text-danger" : "border-line text-ink-muted"
      }`}
    >
      {label}
    </button>
  );
}
