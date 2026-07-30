"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatYen } from "@/lib/format";
import { createLocalId } from "@/lib/local-id";
import { groupOrderItems, sumItems, type OrderGroup } from "@/lib/order-groups";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LocalOrderItem, OrderItem, Product } from "@/lib/types";

import { FreeAmountSheet } from "./free-amount-sheet";
import { GuestNameEditor } from "./guest-name-editor";
import { OrderItemList } from "./order-item-list";
import { ProductGrid } from "./product-grid";

type Props = {
  tabId: string;
  seq: number;
  initialGuestName: string | null;
  initialItems: OrderItem[];
  products: Product[];
  staffId: string;
  editable: boolean;
  paid: boolean;
};

type NewItem = { productId: string | null; name: string; price: number };

export function TabDetail({
  tabId,
  seq,
  initialGuestName,
  initialItems,
  products,
  staffId,
  editable,
  paid,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<LocalOrderItem[]>(initialItems);
  const [guestName, setGuestName] = useState(initialGuestName);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const groups = useMemo(() => groupOrderItems(items), [items]);
  const total = sumItems(items);

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("order_items")
      .select("id, product_id, name_snapshot, price_snapshot, qty, created_at")
      .eq("tab_id", tabId)
      .order("created_at", { ascending: true });

    if (!data) return;

    // DB の内容で置き換えつつ、まだ確定していないローカル行（送信中・失敗）は残す。
    // 自分の insert 直後は一瞬だけ重複して見えることがあるが、insert の完了時に解消される。
    setItems((prev) => [...data, ...prev.filter((item) => item.sync)]);
  }, [tabId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`tab:${tabId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `tab_id=eq.${tabId}` },
        () => {
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tabId, refetch]);

  /** 明細を 1 行追記する。tempId を渡すと失敗行の再送になる。 */
  const insertItem = useCallback(
    async (input: NewItem, tempId?: string) => {
      const localId = tempId ?? createLocalId();

      if (tempId) {
        setItems((prev) =>
          prev.map((item) => (item.id === tempId ? { ...item, sync: "pending" } : item)),
        );
      } else {
        setItems((prev) => [
          ...prev,
          {
            id: localId,
            product_id: input.productId,
            name_snapshot: input.name,
            price_snapshot: input.price,
            qty: 1,
            created_at: new Date().toISOString(),
            sync: "pending",
          },
        ]);
      }

      const supabase = getSupabaseBrowserClient();
      const { data, error: insertError } = await supabase
        .from("order_items")
        .insert({
          tab_id: tabId,
          product_id: input.productId,
          name_snapshot: input.name,
          price_snapshot: input.price,
          staff_id: staffId,
        })
        .select("id, product_id, name_snapshot, price_snapshot, qty, created_at")
        .single();

      if (insertError || !data) {
        setItems((prev) =>
          prev.map((item) => (item.id === localId ? { ...item, sync: "failed" } : item)),
        );
        return;
      }

      setItems((prev) => prev.map((item) => (item.id === localId ? data : item)));
    },
    [tabId, staffId],
  );

  async function deleteItems(targets: LocalOrderItem[]) {
    const synced = targets.filter((item) => !item.sync);
    const locals = targets.filter((item) => item.sync);

    // 未確定行はローカルから消すだけ
    if (locals.length > 0) {
      const localIds = new Set(locals.map((item) => item.id));
      setItems((prev) => prev.filter((item) => !localIds.has(item.id)));
    }

    if (synced.length === 0) return;

    const syncedIds = synced.map((item) => item.id);
    setItems((prev) => prev.filter((item) => !syncedIds.includes(item.id)));

    const supabase = getSupabaseBrowserClient();
    // RLS で弾かれた場合はエラーではなく 0 件になるので、削除できた件数で判定する
    const { data, error: deleteError } = await supabase
      .from("order_items")
      .delete()
      .in("id", syncedIds)
      .select("id");

    if (deleteError || (data?.length ?? 0) !== syncedIds.length) {
      setItems((prev) => [...prev, ...synced]);
      setError("明細を削除できませんでした");
    }
  }

  function addOne(input: NewItem) {
    setError(null);
    void insertItem(input);
  }

  function removeOne(group: OrderGroup) {
    setError(null);
    const target =
      [...group.items].reverse().find((item) => !item.sync) ??
      group.items[group.items.length - 1];
    void deleteItems([target]);
  }

  function removeGroup(group: OrderGroup) {
    setError(null);
    void deleteItems(group.items);
  }

  function retryGroup(group: OrderGroup) {
    setError(null);
    for (const item of group.items) {
      if (item.sync !== "failed") continue;
      void insertItem(
        {
          productId: item.product_id,
          name: item.name_snapshot,
          price: item.price_snapshot,
        },
        item.id,
      );
    }
  }

  async function deleteTab() {
    setDeleting(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { data, error: deleteError } = await supabase
      .from("tabs")
      .delete()
      .eq("id", tabId)
      .select("id");

    if (deleteError || (data?.length ?? 0) === 0) {
      setDeleting(false);
      setError("伝票を削除できませんでした");
      return;
    }

    router.replace("/floor");
  }

  const lockedMessage = paid
    ? "会計済みの伝票です"
    : !editable
      ? "クローズ済みの営業日の伝票です"
      : null;

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 px-5 py-3 backdrop-blur">
        <Link href="/floor" className="inline-flex min-h-tap items-center text-sm text-ink-muted">
          ← 伝票一覧
        </Link>

        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <GuestNameEditor
              tabId={tabId}
              seq={seq}
              guestName={guestName}
              editable={editable}
              onChange={setGuestName}
            />
          </div>
          <span className="shrink-0 text-3xl font-bold tabular-nums">{formatYen(total)}</span>
        </div>

        {lockedMessage && (
          <p className="mt-1 text-xs text-ink-muted">{lockedMessage}</p>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-5 px-5 py-4">
        <ProductGrid
          products={products}
          disabled={!editable}
          onPick={(product) =>
            addOne({ productId: product.id, name: product.name, price: product.price })
          }
          onPickFreeAmount={() => setSheetOpen(true)}
        />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm text-ink-muted">
            注文明細
            <span className="ml-2 text-xs">（− は最後の1件、長押しでまとめて削除）</span>
          </h2>
          <OrderItemList
            groups={groups}
            disabled={!editable}
            onAdd={(group) =>
              addOne({
                productId: group.items[0].product_id,
                name: group.name,
                price: group.price,
              })
            }
            onRemoveOne={removeOne}
            onRemoveGroup={removeGroup}
            onRetry={retryGroup}
          />
        </section>

        {editable && items.length === 0 && (
          <button
            type="button"
            onClick={() => void deleteTab()}
            disabled={deleting}
            className="min-h-tap self-start rounded-lg border border-line px-4 text-sm text-ink-muted disabled:opacity-50"
          >
            {deleting ? "削除中…" : "この伝票を削除"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="px-5 pb-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 border-t border-line bg-surface px-5 pt-3 pb-safe">
        <button
          type="button"
          disabled
          className="min-h-14 w-full rounded-xl bg-accent text-lg font-bold text-accent-ink disabled:opacity-40"
        >
          会計する（{formatYen(total)}）
        </button>
        <p className="mt-1 text-center text-xs text-ink-muted">
          会計処理は次のステップで実装します
        </p>
      </div>

      {sheetOpen && (
        <FreeAmountSheet
          onClose={() => setSheetOpen(false)}
          onSubmit={(name, price) => {
            setSheetOpen(false);
            addOne({ productId: null, name, price });
          }}
        />
      )}
    </main>
  );
}
