"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "@/lib/i18n/provider";

type SortRow = { group: string; id: string };
type Drag = SortRow & {
  x: number;
  y: number;
  horizontal: boolean;
  activated: boolean;
  frame: number;
  cleanup: () => void;
};

type SurfaceOptions = {
  horizontal?: boolean;
  disabled?: boolean;
  ignoreSelector?: string;
};

const DEFAULT_IGNORE = 'input, textarea, select, [contenteditable="true"], [data-drag-ignore], [role="menuitem"]';
const TOUCH_HOLD_MS = 280;
const MOUSE_HOLD_MS = 360;
const TOUCH_SCROLL_SLOP = 8;
const MOUSE_DRAG_THRESHOLD = 6;

export function useSortDrag(
  onMove: (group: string, from: string, to: string, ids: string[]) => void,
  getScroller?: (group: string) => HTMLElement | null
) {
  const { t } = useI18n();
  const drag = useRef<Drag | null>(null);
  const suppressCleanup = useRef<(() => void) | null>(null);
  const [active, setActive] = useState<SortRow | null>(null);
  const [target, setTarget] = useState<SortRow | null>(null);

  useEffect(() => () => {
    drag.current?.cleanup();
    suppressCleanup.current?.();
  }, []);

  function rowAt(current: Drag, x: number, y: number) {
    const selector = `[data-sort-group="${CSS.escape(current.group)}"]`;
    const stack = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)].filter((node): node is Element => !!node);
    for (const element of stack) {
      const candidate = element.closest<HTMLElement>(selector);
      const sortId = candidate?.dataset.sortId;
      if (sortId && sortId !== current.id) return sortId;
    }
    return undefined;
  }

  function track() {
    const current = drag.current;
    if (!current || !current.activated) return;
    const scroller = getScroller?.(current.group);
    const bounds = scroller?.getBoundingClientRect();
    const coordinate = current.horizontal ? current.x : current.y;
    const start = current.horizontal ? bounds?.left ?? 0 : bounds?.top ?? 0;
    const end = current.horizontal ? bounds?.right ?? window.innerWidth : bounds?.bottom ?? window.innerHeight;
    const edge = Math.min(56, (end - start) / 4);
    const step = coordinate < start + edge ? -10 : coordinate > end - edge ? 10 : 0;
    if (step) (scroller || window).scrollBy(current.horizontal ? step : 0, current.horizontal ? 0 : step);
    const id = rowAt(current, current.x, current.y);
    setTarget(previous => previous?.id === id ? previous : id ? { group: current.group, id } : null);
    current.frame = requestAnimationFrame(track);
  }

  function suppressTrailingClick() {
    suppressCleanup.current?.();
    const clear = () => {
      window.removeEventListener("click", blockClick, true);
      window.clearTimeout(timer);
      if (suppressCleanup.current === clear) suppressCleanup.current = null;
    };
    function blockClick(event: MouseEvent) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      clear();
    }
    const timer = window.setTimeout(clear, 350);
    window.addEventListener("click", blockClick, true);
    suppressCleanup.current = clear;
  }

  function startSession(
    event: ReactPointerEvent<HTMLElement>,
    group: string,
    id: string,
    ids: string[],
    options: { horizontal: boolean; requireHold: boolean; disabled?: boolean }
  ) {
    if (options.disabled || event.button !== 0 || drag.current || ids.length <= 1) return;
    suppressCleanup.current?.();
    const isTouch = event.pointerType !== "mouse";
    if (!options.requireHold && !isTouch) event.preventDefault();
    const pointer = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let holdTimer = 0;
    let blockingTouchScroll = false;

    const current: Drag = { group, id, x: startX, y: startY, horizontal: options.horizontal, activated: false, frame: 0, cleanup };

    function blockTouchScroll(touchEvent: TouchEvent) {
      if (current.activated) touchEvent.preventDefault();
    }
    function blockContextMenu(menuEvent: MouseEvent) {
      if (isTouch || current.activated) menuEvent.preventDefault();
    }
    function activate() {
      if (current.activated || drag.current !== current) return;
      current.activated = true;
      window.clearTimeout(holdTimer);
      holdTimer = 0;
      try { window.getSelection?.()?.removeAllRanges(); } catch {}
      if (isTouch) {
        try { navigator.vibrate?.(12); } catch {}
        if (!blockingTouchScroll) {
          blockingTouchScroll = true;
          window.addEventListener("touchmove", blockTouchScroll, { capture: true, passive: false });
        }
      }
      document.body.classList.add("is-sort-dragging");
      setActive({ group, id });
      current.frame = requestAnimationFrame(track);
    }
    function cleanup() {
      window.clearTimeout(holdTimer);
      cancelAnimationFrame(current.frame);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", drop, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("contextmenu", blockContextMenu, true);
      window.removeEventListener("blur", finish);
      if (blockingTouchScroll) {
        blockingTouchScroll = false;
        window.removeEventListener("touchmove", blockTouchScroll, true);
      }
      document.body.classList.remove("is-sort-dragging");
      if (drag.current === current) drag.current = null;
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
      if (!current.activated) {
        const distance = Math.hypot(next.clientX - startX, next.clientY - startY);
        if (isTouch && options.requireHold) {
          if (distance > TOUCH_SCROLL_SLOP) finish();
          return;
        }
        if (distance >= MOUSE_DRAG_THRESHOLD) activate();
      }
    }
    function drop(next: globalThis.PointerEvent) {
      if (next.pointerId !== pointer) return;
      const wasActive = current.activated;
      const targetId = wasActive ? rowAt(current, next.clientX, next.clientY) : undefined;
      finish();
      if (wasActive) {
        suppressTrailingClick();
        if (targetId && targetId !== id) onMove(group, id, targetId, ids);
      }
    }
    function cancel(next: globalThis.PointerEvent) {
      if (next.pointerId === pointer) finish();
    }

    drag.current = current;
    if (options.requireHold) {
      holdTimer = window.setTimeout(activate, isTouch ? TOUCH_HOLD_MS : MOUSE_HOLD_MS);
    } else if (isTouch) {
      blockingTouchScroll = true;
      window.addEventListener("touchmove", blockTouchScroll, { capture: true, passive: false });
    }
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", drop, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("contextmenu", blockContextMenu, true);
    window.addEventListener("blur", finish);
  }

  function handle(group: string, id: string, name: string, ids: string[], horizontal = false) {
    return {
      "aria-label": t("拖动 {name} 排序，也可使用方向键", { name }),
      onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
        startSession(event, group, id, ids, { horizontal, requireHold: false });
      },
      onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
        const step = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
        if (!step) return;
        event.preventDefault();
        const neighbor = ids[ids.indexOf(id) + step];
        if (neighbor) onMove(group, id, neighbor, ids);
      },
    };
  }

  function surface(group: string, id: string, name: string, ids: string[], options: SurfaceOptions = {}) {
    const horizontal = options.horizontal ?? false;
    const disabled = options.disabled ?? ids.length <= 1;
    const ignoreSelector = options.ignoreSelector ?? DEFAULT_IGNORE;
    return {
      "aria-roledescription": disabled ? undefined : t("拖动 {name} 排序，也可使用方向键", { name }),
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (disabled) return;
        const targetElement = event.target as HTMLElement | null;
        if (targetElement?.closest(ignoreSelector)) return;
        startSession(event, group, id, ids, { horizontal, requireHold: true, disabled });
      },
      onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
        if (disabled) return;
        const targetElement = event.target as HTMLElement | null;
        if (targetElement?.closest(ignoreSelector)) return;
        const step = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
        if (!step) return;
        const isSelf = event.currentTarget === event.target;
        if (!event.altKey && !isSelf) return;
        if (!event.altKey && isSelf && event.currentTarget.tagName === "BUTTON") return;
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
  return { handle, surface, row, dragging: active !== null };
}
export type SortDrag = ReturnType<typeof useSortDrag>;
