"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { SortableRows, useSortableRow } from "../sortable-rows";

export type AdminCategory = {
  id: string;
  name: string;
  sort_order: number;
  productCount: number;
};

export function CategoryTable({ initialCategories }: { initialCategories: AdminCategory[] }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [keyword, setKeyword] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const visible = useMemo(() => {
    const trimmed = keyword.trim();
    return trimmed === "" ? categories : categories.filter((c) => c.name.includes(trimmed));
  }, [categories, keyword]);

  const sortable = keyword.trim() === "" && editingId === null;

  function refresh() {
    startRefresh(() => router.refresh());
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;

    setBusyId("new");
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0);
    const { error: insertError } = await supabase
      .from("categories")
      .insert({ name, sort_order: maxOrder + 10 });

    setBusyId(null);

    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "同じ名前のカテゴリがすでにあります"
          : "カテゴリを追加できませんでした",
      );
      return;
    }

    setNewName("");
    refresh();
  }

  async function rename(id: string) {
    const name = editingName.trim();
    if (!name) return;

    setBusyId(id);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase.from("categories").update({ name }).eq("id", id);

    setBusyId(null);

    if (updateError) {
      setError(
        updateError.code === "23505"
          ? "同じ名前のカテゴリがすでにあります"
          : "変更できませんでした",
      );
      return;
    }

    setEditingId(null);
    refresh();
  }

  async function reorder(ids: string[]) {
    const byId = new Map(categories.map((c) => [c.id, c]));
    setCategories(ids.map((id) => byId.get(id)).filter((c): c is AdminCategory => c !== undefined));
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: rpcError } = await supabase.rpc("reorder_categories", { category_ids: ids });

    if (rpcError) {
      setCategories(initialCategories);
      setError("並べ替えを保存できませんでした");
      return;
    }

    refresh();
  }

  async function remove(category: AdminCategory) {
    setBusyId(category.id);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { data, error: deleteError } = await supabase
      .from("categories")
      .delete()
      .eq("id", category.id)
      .select("id");

    setBusyId(null);

    if (deleteError || (data?.length ?? 0) === 0) {
      setError("削除できませんでした");
      return;
    }

    refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">カテゴリ</h1>
        <Link
          href="/admin/products"
          className="rounded-lg border border-line px-3 py-1 text-sm text-ink-muted"
        >
          商品マスタへ
        </Link>
      </div>

      <p className="text-sm text-ink-muted">
        ここでの並びが営業画面のカテゴリタブの並びになります。行の左端を掴んで入れ替えてください。
        カテゴリを削除しても商品は残り、「未分類」になります。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="カテゴリ名で検索"
          className="h-9 w-56 rounded-lg border border-line bg-raised px-3 outline-none focus:border-accent"
        />
        <span className="text-xs text-ink-muted">
          {visible.length} / {categories.length} 件
          {!sortable && "・絞り込み中は並べ替えできません"}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">新しいカテゴリ</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
            className="h-9 w-56 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busyId === "new" || newName.trim() === ""}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-40"
        >
          追加
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        {visible.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-ink-muted">
            カテゴリがありません
          </p>
        )}

        <SortableRows items={visible} onReorder={reorder} disabled={!sortable}>
          {(category) => (
            <CategoryRow
              key={category.id}
              category={category}
              sortable={sortable}
              busy={busyId === category.id || refreshing}
              editing={editingId === category.id}
              editingName={editingName}
              onEditingNameChange={setEditingName}
              onEdit={() => {
                setEditingId(category.id);
                setEditingName(category.name);
              }}
              onCancelEdit={() => setEditingId(null)}
              onSubmitEdit={() => void rename(category.id)}
              onRemove={() => void remove(category)}
            />
          )}
        </SortableRows>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  sortable,
  busy,
  editing,
  editingName,
  onEditingNameChange,
  onEdit,
  onCancelEdit,
  onSubmitEdit,
  onRemove,
}: {
  category: AdminCategory;
  sortable: boolean;
  busy: boolean;
  editing: boolean;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
  onRemove: () => void;
}) {
  const { setNodeRef, style, handleProps } = useSortableRow(category.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 text-sm"
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

      {editing ? (
        <>
          <input
            value={editingName}
            onChange={(event) => onEditingNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmitEdit();
              if (event.key === "Escape") onCancelEdit();
            }}
            autoFocus
            className="h-8 flex-1 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={onSubmitEdit}
            disabled={busy}
            className="rounded border border-line px-2 py-1 text-xs disabled:opacity-40"
          >
            保存
          </button>
          <button type="button" onClick={onCancelEdit} className="px-2 py-1 text-xs text-ink-muted">
            取消
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate font-bold">{category.name}</span>
          <span className="w-24 text-right text-ink-muted tabular-nums">
            商品 {category.productCount}
          </span>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="rounded border border-line px-2 py-1 text-xs text-ink-muted disabled:opacity-40"
          >
            名前を変更
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="rounded border border-danger px-2 py-1 text-xs text-danger disabled:opacity-40"
          >
            削除
          </button>
        </>
      )}
    </div>
  );
}
