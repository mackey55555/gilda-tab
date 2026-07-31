"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Props<T extends { id: string }> = {
  items: T[];
  /** 並べ替え後の id 配列。サーバへは順序をそのまま送る。 */
  onReorder: (ids: string[]) => void;
  disabled?: boolean;
  children: (item: T) => React.ReactNode;
};

/**
 * ドラッグ＆ドロップで並べ替えられるリスト。
 * 掴む場所はハンドルに限定して、行内のボタンや入力を邪魔しないようにしている。
 */
export function SortableRows<T extends { id: string }>({
  items,
  onReorder,
  disabled,
  children,
}: Props<T>) {
  const sensors = useSensors(
    // 数 px 動かしてからドラッグ開始。クリックと区別するため。
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;

    onReorder(arrayMove(items, from, to).map((item) => item.id));
  }

  if (disabled) {
    return <>{items.map((item) => children(item))}</>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => children(item))}
      </SortableContext>
    </DndContext>
  );
}

/** 並べ替え対象の行。handleProps を掴む場所に展開する。 */
export function useSortableRow(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return {
    setNodeRef,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : 1,
      // ドラッグ中の行を他より前に出す
      zIndex: isDragging ? 1 : 0,
      position: "relative" as const,
    },
    handleProps: { ...attributes, ...listeners },
    isDragging,
  };
}
