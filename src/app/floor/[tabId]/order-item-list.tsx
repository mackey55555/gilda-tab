"use client";

import { useRef } from "react";

import { formatYen } from "@/lib/format";
import type { OrderGroup } from "@/lib/order-groups";

/** 長押しでグループ全削除と判定する時間 */
const LONG_PRESS_MS = 600;

type Props = {
  groups: OrderGroup[];
  disabled: boolean;
  onAdd: (group: OrderGroup) => void;
  onRemoveOne: (group: OrderGroup) => void;
  onRemoveGroup: (group: OrderGroup) => void;
  onRetry: (group: OrderGroup) => void;
};

export function OrderItemList({
  groups,
  disabled,
  onAdd,
  onRemoveOne,
  onRemoveGroup,
  onRetry,
}: Props) {
  if (groups.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-muted">
        まだ注文がありません
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {groups.map((group) => (
        <OrderItemRow
          key={group.key}
          group={group}
          disabled={disabled}
          onAdd={onAdd}
          onRemoveOne={onRemoveOne}
          onRemoveGroup={onRemoveGroup}
          onRetry={onRetry}
        />
      ))}
    </ul>
  );
}

function OrderItemRow({
  group,
  disabled,
  onAdd,
  onRemoveOne,
  onRemoveGroup,
  onRetry,
}: {
  group: OrderGroup;
} & Omit<Props, "groups">) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const hasFailed = group.items.some((item) => item.sync === "failed");
  const hasPending = group.items.some((item) => item.sync === "pending");

  function startLongPress() {
    if (disabled) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onRemoveGroup(group);
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <li
      className={`flex items-center gap-2 rounded-xl border bg-surface px-3 py-2 ${
        hasFailed ? "border-danger" : "border-line"
      }`}
    >
      <div
        // 長押しでグループごと削除。誤爆しても金額表示で気付ける範囲に留める。
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        className="flex min-w-0 flex-1 flex-col"
      >
        <span className="truncate font-bold">
          {group.name}
          {hasPending && <span className="ml-2 text-xs text-ink-muted">送信中…</span>}
        </span>
        <span className="text-xs text-ink-muted tabular-nums">
          {formatYen(group.price)} × {group.qty}
        </span>
      </div>

      <span className="shrink-0 text-base font-bold tabular-nums">
        {formatYen(group.price * group.qty)}
      </span>

      {hasFailed ? (
        <button
          type="button"
          onClick={() => onRetry(group)}
          className="min-h-tap shrink-0 rounded-lg border border-danger px-3 text-sm text-danger"
        >
          再試行
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onRemoveOne(group)}
            disabled={disabled}
            aria-label={`${group.name} を1つ減らす`}
            className="size-tap rounded-lg border border-line text-xl leading-none active:bg-raised disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => onAdd(group)}
            disabled={disabled}
            aria-label={`${group.name} を1つ増やす`}
            className="size-tap rounded-lg border border-line text-xl leading-none active:bg-raised disabled:opacity-40"
          >
            ＋
          </button>
        </div>
      )}
    </li>
  );
}
