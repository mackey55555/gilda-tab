"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createLocalId } from "@/lib/local-id";
import { groupOrderItems, sumItems, type OrderGroup } from "@/lib/order-groups";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LocalOrderItem } from "@/lib/types";

const COLUMNS = "id, product_id, name_snapshot, price_snapshot, qty, created_at";

export type NewItem = { productId: string | null; name: string; price: number };

/**
 * 1 枚の伝票の明細を扱う。カードを開いたときだけ読み込み、購読する。
 *
 * 書き込みは楽観的に反映し、失敗した行は sync: "failed" にして再試行できるようにする
 * （電波が悪い店内で、送信できたかどうかが分からない状態を作らないため）。
 */
export function useTabItems(
  tabId: string,
  staffId: string,
  enabled: boolean,
  /** 書き込みがサーバに反映されたあとに呼ぶ。一覧の集計を取り直させるため。 */
  onSynced?: () => void,
) {
  const [items, setItems] = useState<LocalOrderItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 毎レンダーで作り直される関数を useCallback の依存に入れたくないので ref 越しに持つ。
  // 更新はレンダー中ではなく effect で行う（レンダー中の ref 書き込みは禁止）。
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  });

  const reload = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("order_items")
      .select(COLUMNS)
      .eq("tab_id", tabId)
      .order("created_at", { ascending: true });

    if (!data) return;

    // 未確定のローカル行（送信中・失敗）は残す
    setItems((prev) => [...data, ...prev.filter((item) => item.sync)]);
    setLoaded(true);
  }, [tabId]);

  useEffect(() => {
    if (!enabled) return;

    // reload は非同期で、状態更新は必ず await のあと。カードを開いた時点の
    // 明細を取りに行くだけなので、この呼び出しが連鎖レンダーを起こすことはない。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`tab-items:${tabId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `tab_id=eq.${tabId}` },
        () => {
          void reload();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, tabId, reload]);

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
        .select(COLUMNS)
        .single();

      if (insertError || !data) {
        setItems((prev) =>
          prev.map((item) => (item.id === localId ? { ...item, sync: "failed" } : item)),
        );
        return;
      }

      setItems((prev) => prev.map((item) => (item.id === localId ? data : item)));

      // 書き込みが確定してから通知する。先に呼ぶと、一覧が反映前の集計を読んでしまう。
      onSyncedRef.current?.();
    },
    [tabId, staffId],
  );

  const deleteItems = useCallback(async (targets: LocalOrderItem[]) => {
    const synced = targets.filter((item) => !item.sync);
    const locals = targets.filter((item) => item.sync);

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
      return;
    }

    onSyncedRef.current?.();
  }, []);

  const addOne = useCallback(
    (input: NewItem) => {
      setError(null);
      void insertItem(input);
    },
    [insertItem],
  );

  const removeOne = useCallback(
    (group: OrderGroup) => {
      setError(null);
      const target =
        [...group.items].reverse().find((item) => !item.sync) ??
        group.items[group.items.length - 1];
      void deleteItems([target]);
    },
    [deleteItems],
  );

  const removeGroup = useCallback(
    (group: OrderGroup) => {
      setError(null);
      void deleteItems(group.items);
    },
    [deleteItems],
  );

  const retryGroup = useCallback(
    (group: OrderGroup) => {
      setError(null);
      for (const item of group.items) {
        if (item.sync !== "failed") continue;
        void insertItem(
          { productId: item.product_id, name: item.name_snapshot, price: item.price_snapshot },
          item.id,
        );
      }
    },
    [insertItem],
  );

  const groups = useMemo(() => groupOrderItems(items), [items]);

  return {
    items,
    groups,
    total: sumItems(items),
    loaded,
    error,
    addOne,
    removeOne,
    removeGroup,
    retryGroup,
  };
}
