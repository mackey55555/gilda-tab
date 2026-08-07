"use client";

import { useRef, useState } from "react";

import { formatElapsed, formatYen, guestLabel } from "@/lib/format";
import type { GuestSuggestion } from "@/lib/guest-suggestions";
import type { Category, Product, TabSummary } from "@/lib/types";

import { GuestNameEditor } from "./guest-name-editor";
import { ProductModal } from "./product-modal";
import { useTabItems } from "./use-tab-items";

/** 削除ボタンを出すためにカードをずらす量 */
const REVEAL_WIDTH = 88;
/** 横スワイプと判定する最小移動量。縦スクロールを邪魔しないため。 */
const SWIPE_THRESHOLD = 10;

type Props = {
  tab: TabSummary;
  now: number;
  staffId: string;
  products: Product[];
  categories: Category[];
  guestSuggestions: GuestSuggestion[];
  expanded: boolean;
  selecting: boolean;
  selected: boolean;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSettle: (tab: TabSummary) => void;
  onDeleted: () => void;
  onChanged: () => void;
};

export function TabCard({
  tab,
  now,
  staffId,
  products,
  categories,
  guestSuggestions,
  expanded,
  selecting,
  selected,
  onToggleExpand,
  onToggleSelect,
  onSettle,
  onDeleted,
  onChanged,
}: Props) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drag = useRef<{ x: number; y: number; axis: "none" | "x" | "y" } | null>(null);
  const items = useTabItems(tab.id, staffId, expanded);

  // 明細のある伝票は DB 側でも削除できない。誤って売上を消さないための決まり。
  const canDelete = tab.itemCount === 0;
  // 開いている間はフックの合計の方が新しい
  const total = expanded && items.loaded ? items.total : tab.total;

  function onPointerDown(event: React.PointerEvent) {
    if (!canDelete || selecting) return;
    drag.current = { x: event.clientX, y: event.clientY, axis: "none" };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent) {
    const state = drag.current;
    if (!state) return;

    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;

    if (state.axis === "none") {
      if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
      state.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      // 縦に動かし始めたらスクロールに任せる
      if (state.axis === "y") {
        drag.current = null;
        setDragging(false);
      }
      return;
    }

    const base = revealed ? -REVEAL_WIDTH : 0;
    setOffset(Math.min(0, Math.max(-REVEAL_WIDTH, base + dx)));
  }

  function onPointerUp() {
    const state = drag.current;
    drag.current = null;
    setDragging(false);

    if (!state || state.axis !== "x") return;

    const next = offset < -REVEAL_WIDTH / 2;
    setRevealed(next);
    setOffset(next ? -REVEAL_WIDTH : 0);
  }

  function closeReveal() {
    setRevealed(false);
    setOffset(0);
  }

  async function deleteTab() {
    setDeleting(true);
    setError(null);

    const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = getSupabaseBrowserClient();
    const { data, error: deleteError } = await supabase
      .from("tabs")
      .delete()
      .eq("id", tab.id)
      .select("id");

    if (deleteError || (data?.length ?? 0) === 0) {
      setDeleting(false);
      setError("削除できませんでした。注文が入っている伝票は削除できません。");
      closeReveal();
      return;
    }

    onDeleted();
  }

  // 客名は state にコピーしない。コピーすると保存後にサーバから届いた値と食い違い、
  // 再マウントのタイミングで古い値（＝仮名）に戻って見える。
  const label = guestLabel(tab.guestName, tab.seq);

  return (
    <li className="relative overflow-hidden rounded-xl">
      {canDelete && !selecting && (
        <div className="absolute inset-y-0 right-0 flex w-[88px] items-stretch">
          <button
            type="button"
            onClick={() => void deleteTab()}
            disabled={deleting}
            tabIndex={revealed ? 0 : -1}
            aria-hidden={!revealed}
            className="w-full rounded-r-xl bg-danger text-sm font-bold text-ink disabled:opacity-60"
          >
            {deleting ? "削除中…" : "削除"}
          </button>
        </div>
      )}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? undefined : "transform 150ms ease-out",
          touchAction: "pan-y",
        }}
        className="relative rounded-xl border border-line bg-surface"
      >
        <div className="flex items-stretch">
          {selecting && (
            <button
              type="button"
              onClick={() => onToggleSelect(tab.id)}
              aria-pressed={selected}
              aria-label={`${label} を選択`}
              className="flex w-12 shrink-0 items-center justify-center"
            >
              <span
                className={`grid size-6 place-items-center rounded-md border text-sm ${
                  selected ? "border-accent bg-accent text-accent-ink" : "border-line"
                }`}
              >
                {selected ? "✓" : ""}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (revealed) {
                closeReveal();
                return;
              }
              if (selecting) onToggleSelect(tab.id);
              else onToggleExpand(tab.id);
            }}
            aria-expanded={expanded}
            className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-lg font-bold">{label}</span>
              <span className="text-xs text-ink-muted">
                {tab.itemCount === 0 ? "注文なし" : formatElapsed(tab.lastOrderedAt, now)}
              </span>
            </span>
            <span className="shrink-0 text-xl font-bold tabular-nums">{formatYen(total)}</span>
          </button>

          {!selecting && (
            <button
              type="button"
              onClick={() => onSettle({ ...tab, total })}
              disabled={tab.itemCount === 0 && !items.loaded}
              className="my-2 mr-2 w-16 shrink-0 rounded-lg bg-accent text-sm font-bold text-accent-ink disabled:opacity-30"
            >
              会計
            </button>
          )}
        </div>

        {expanded && !selecting && (
          <div className="border-t border-line px-4 py-3">
            <GuestNameEditor
              tabId={tab.id}
              seq={tab.seq}
              guestName={tab.guestName}
              suggestions={guestSuggestions}
              editable
              onChange={onChanged}
            />

            <ul className="mt-3 flex flex-col gap-1.5">
              {items.groups.length === 0 && (
                <li className="py-3 text-center text-sm text-ink-muted">
                  {items.loaded ? "まだ注文がありません" : "読み込み中…"}
                </li>
              )}

              {items.groups.map((group) => {
                const failed = group.items.some((item) => item.sync === "failed");
                const pending = group.items.some((item) => item.sync === "pending");

                return (
                  <li
                    key={group.key}
                    className={`flex items-center gap-2 rounded-lg border bg-raised px-3 py-2 ${
                      failed ? "border-danger" : "border-transparent"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">
                        {group.name}
                        {pending && <span className="ml-2 text-xs text-ink-muted">送信中…</span>}
                      </span>
                      <span className="text-xs text-ink-muted tabular-nums">
                        {formatYen(group.price)} × {group.qty}
                      </span>
                    </div>

                    {failed ? (
                      <button
                        type="button"
                        onClick={() => items.retryGroup(group)}
                        className="min-h-tap shrink-0 rounded-lg border border-danger px-3 text-sm text-danger"
                      >
                        再試行
                      </button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            items.removeOne(group);
                            onChanged();
                          }}
                          aria-label={`${group.name} を1つ減らす`}
                          className="size-tap rounded-lg border border-line text-xl leading-none active:bg-surface"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            items.addOne({
                              productId: group.items[0].product_id,
                              name: group.name,
                              price: group.price,
                            });
                            onChanged();
                          }}
                          aria-label={`${group.name} を1つ増やす`}
                          className="size-tap rounded-lg border border-line text-xl leading-none active:bg-surface"
                        >
                          ＋
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3 min-h-tap w-full rounded-lg border border-dashed border-line text-sm text-accent"
            >
              ＋ 商品から選ぶ
            </button>

            {(items.error ?? error) && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {items.error ?? error}
              </p>
            )}
          </div>
        )}
      </div>

      {error && !expanded && (
        <p role="alert" className="px-4 py-1 text-sm text-danger">
          {error}
        </p>
      )}

      {modalOpen && (
        <ProductModal
          title={`${label} に追加`}
          products={products}
          categories={categories}
          onPick={(item) => {
            items.addOne(item);
            onChanged();
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </li>
  );
}
