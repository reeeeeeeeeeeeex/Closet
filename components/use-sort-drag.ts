"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useI18n } from "@/lib/i18n/provider";

type SortRow = { group: string; id: string };
type Drag = SortRow & { x: number; y: number; horizontal: boolean; frame: number; cleanup: () => void };

export function useSortDrag(onMove: (group: string, from: string, to: string, ids: string[]) => void, getScroller?: (group: string) => HTMLElement | null) {
  const { t } = useI18n();
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState<SortRow | null>(null);
  const [target, setTarget] = useState<SortRow | null>(null);

  useEffect(() => () => drag.current?.cleanup(), []);

  function rowAt(current: Drag, x: number, y: number) {
    return document.elementFromPoint(x, y)?.closest<HTMLElement>(`[data-sort-group="${CSS.escape(current.group)}"]`)?.dataset.sortId;
  }

  function track() {
    const current = drag.current;
    if (!current) return;
    const scroller = getScroller?.(current.group);
    const bounds = scroller?.getBoundingClientRect();
    const coordinate = current.horizontal ? current.x : current.y;
    const start = current.horizontal ? bounds?.left ?? 0 : bounds?.top ?? 0;
    const end = current.horizontal ? bounds?.right ?? window.innerWidth : bounds?.bottom ?? window.innerHeight;
    const edge = Math.min(52, (end - start) / 4);
    const step = coordinate < start + edge ? -10 : coordinate > end - edge ? 10 : 0;
    if (step) (scroller || window).scrollBy(current.horizontal ? step : 0, current.horizontal ? 0 : step);
    const id = rowAt(current, current.x, current.y);
    setTarget(previous => previous?.id === id ? previous : id ? { group: current.group, id } : null);
    current.frame = requestAnimationFrame(track);
  }

  function handle(group: string, id: string, name: string, ids: string[], horizontal = false) {
    return {
      "aria-label": t("拖动 {name} 排序，也可使用方向键", { name }),
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        const pointer = event.pointerId;
        const startX = event.clientX;
        const startY = event.clientY;
        const current = { group, id, x: startX, y: startY, horizontal, frame: 0, cleanup };
        function cleanup() {
          cancelAnimationFrame(current.frame);
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", drop, true);
          window.removeEventListener("pointercancel", cancel, true);
          window.removeEventListener("blur", finish);
          drag.current = null;
        }
        function finish() {
          cleanup();
          setActive(null);
          setTarget(null);
        }
        function move(next: globalThis.PointerEvent) {
          if (next.pointerId !== pointer) return;
          current.x = next.clientX;
          current.y = next.clientY;
          if (!current.frame && Math.hypot(next.clientX - startX, next.clientY - startY) >= 5) {
            setActive({ group, id });
            current.frame = requestAnimationFrame(track);
          }
        }
        function drop(next: globalThis.PointerEvent) {
          if (next.pointerId !== pointer) return;
          const targetId = current.frame && rowAt(current, next.clientX, next.clientY);
          finish();
          if (targetId && targetId !== id) onMove(group, id, targetId, ids);
        }
        function cancel(next: globalThis.PointerEvent) {
          if (next.pointerId === pointer) finish();
        }
        drag.current = current;
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", drop, true);
        window.addEventListener("pointercancel", cancel, true);
        window.addEventListener("blur", finish);
      },
      onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
        const step = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
        if (!step) return;
        event.preventDefault();
        const neighbor = ids[ids.indexOf(id) + step];
        if (neighbor) onMove(group, id, neighbor, ids);
      },
    };
  }

  function row(group: string, id: string) {
    return {
      "data-sort-group": group,
      "data-sort-id": id,
      "data-dragging": (active?.group === group && active.id === id) || undefined,
      "data-drop-target": (target?.group === group && target.id === id && active?.id !== id) || undefined,
    };
  }
  return { handle, row };
}
export type SortDrag = ReturnType<typeof useSortDrag>;
