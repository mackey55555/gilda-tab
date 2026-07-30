"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { formatYen } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { ProductForm, type ProductDraft } from "./product-form";

export type AdminProduct = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  sort_order: number;
  is_active: boolean;
  /** 一度でも注文されたか。使用済みは削除させず無効化に倒す。 */
  used: boolean;
};

type Filter = "active" | "all";

export function ProductTable({ initialProducts }: { initialProducts: AdminProduct[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("active");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const categories = useMemo(
    () =>
      [...new Set(initialProducts.map((product) => product.category).filter(Boolean))] as string[],
    [initialProducts],
  );

  const visible =
    filter === "active" ? initialProducts.filter((product) => product.is_active) : initialProducts;

  /** 書き込み後はサーバから引き直す。並べ替えは全体の sort_order が変わるため。 */
  function refresh() {
    startRefresh(() => router.refresh());
  }

  async function run(id: string | null, action: () => Promise<{ error: unknown }>) {
    setBusyId(id ?? "new");
    setError(null);

    const { error: actionError } = await action();

    setBusyId(null);

    if (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "操作に失敗しました",
      );
      return false;
    }

    refresh();
    return true;
  }

  async function create(draft: ProductDraft) {
    const supabase = getSupabaseBrowserClient();
    const maxOrder = initialProducts.reduce(
      (max, product) => Math.max(max, product.sort_order),
      0,
    );

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

  async function move(product: AdminProduct, direction: "up" | "down") {
    const supabase = getSupabaseBrowserClient();
    await run(product.id, async () =>
      supabase.rpc("move_product", { target_product_id: product.id, direction }),
    );
  }

  async function remove(product: AdminProduct) {
    const supabase = getSupabaseBrowserClient();
    // RLS で弾かれた場合はエラーではなく 0 件になるので、消えた件数で判定する
    setBusyId(product.id);
    setError(null);

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
        <div className="flex items-center gap-2">
          <FilterTab label="有効のみ" active={filter === "active"} onClick={() => setFilter("active")} />
          <FilterTab label="すべて" active={filter === "all"} onClick={() => setFilter("all")} />
        </div>
      </div>

      <p className="text-sm text-ink-muted">
        表示順は営業画面の商品グリッドの並びです。よく出る商品を上に置いてください。
        注文実績のある商品は削除できません（無効化すると営業画面から消えます）。
      </p>

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

      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th className="w-24 px-3 py-1 font-normal">表示順</th>
            <th className="px-3 py-1 font-normal">商品名</th>
            <th className="w-40 px-3 py-1 font-normal">カテゴリ</th>
            <th className="w-28 px-3 py-1 text-right font-normal">価格</th>
            <th className="w-20 px-3 py-1 font-normal">状態</th>
            <th className="w-60 px-3 py-1 font-normal">操作</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-ink-muted">
                商品がありません
              </td>
            </tr>
          )}

          {visible.map((product, index) => {
            const busy = busyId === product.id || refreshing;

            if (editingId === product.id) {
              return (
                <tr key={product.id}>
                  <td colSpan={6} className="rounded-xl bg-surface px-3 py-3">
                    <ProductForm
                      initial={{
                        name: product.name,
                        price: product.price,
                        category: product.category,
                      }}
                      categories={categories}
                      submitLabel="保存する"
                      pending={busy}
                      onSubmit={(draft) => void update(product.id, draft)}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              );
            }

            return (
              <tr key={product.id} className={product.is_active ? "" : "opacity-50"}>
                <td className="rounded-l-lg bg-surface px-3 py-2">
                  <div className="flex items-center gap-1">
                    <MoveButton
                      label="上へ"
                      glyph="↑"
                      disabled={busy || index === 0}
                      onClick={() => void move(product, "up")}
                    />
                    <MoveButton
                      label="下へ"
                      glyph="↓"
                      disabled={busy || index === visible.length - 1}
                      onClick={() => void move(product, "down")}
                    />
                  </div>
                </td>
                <td className="bg-surface px-3 py-2 font-bold">{product.name}</td>
                <td className="bg-surface px-3 py-2 text-ink-muted">{product.category ?? "—"}</td>
                <td className="bg-surface px-3 py-2 text-right tabular-nums">
                  {formatYen(product.price)}
                </td>
                <td className="bg-surface px-3 py-2">
                  <span className={product.is_active ? "text-ink" : "text-ink-muted"}>
                    {product.is_active ? "有効" : "無効"}
                  </span>
                </td>
                <td className="rounded-r-lg bg-surface px-3 py-2">
                  <div className="flex items-center gap-2">
                    <RowButton label="編集" disabled={busy} onClick={() => setEditingId(product.id)} />
                    <RowButton
                      label={product.is_active ? "無効化" : "有効化"}
                      disabled={busy}
                      onClick={() => void toggleActive(product)}
                    />
                    {product.used ? (
                      <span className="text-xs text-ink-muted">注文実績あり</span>
                    ) : (
                      <RowButton
                        label="削除"
                        danger
                        disabled={busy}
                        onClick={() => void remove(product)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
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

function MoveButton({
  label,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="size-7 rounded border border-line text-xs disabled:opacity-30"
    >
      {glyph}
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
