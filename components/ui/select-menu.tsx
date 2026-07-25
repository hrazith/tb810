"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";

export type SelectMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

type SelectMenuProps = {
  ariaLabel: string;
  icon: ReactNode;
  items: SelectMenuItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  align?: "start" | "end";
  className?: string;
};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function isElementNode(node: ReactNode): node is ReactElement {
  return isValidElement(node);
}

export function SelectMenu({
  ariaLabel,
  icon,
  items,
  selectedId,
  onSelect,
  align = "end",
  className,
}: SelectMenuProps) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);

  const selectedIndex = useMemo(
    () => items.findIndex((item) => item.id === selectedId),
    [items, selectedId],
  );
  const firstEnabledIndex = useMemo(
    () => items.findIndex((item) => !item.disabled),
    [items],
  );

  function getNextEnabledIndex(fromIndex: number, direction: 1 | -1) {
    if (!items.length) return -1;
    for (let step = 1; step <= items.length; step += 1) {
      const index =
        (fromIndex + direction * step + items.length) % items.length;
      if (!items[index]?.disabled) {
        return index;
      }
    }
    return -1;
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent | globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const nextIndex =
      selectedIndex >= 0 ? selectedIndex : firstEnabledIndex;
    if (nextIndex >= 0) {
      queueMicrotask(() => itemRefs.current[nextIndex]?.focus());
    }
  }, [open, firstEnabledIndex, selectedIndex]);

  function closeMenu() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function moveFocus(nextIndex: number) {
    if (nextIndex < 0) return;
    itemRefs.current[nextIndex]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      moveFocus(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      moveFocus(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => {
        const nextOpen = !current;
        if (nextOpen) {
          queueMicrotask(() =>
            moveFocus(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex),
          );
        }
        return nextOpen;
      });
    }
  }

  function handleItemKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(getNextEnabledIndex(index, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(getNextEnabledIndex(index, -1));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      moveFocus(firstEnabledIndex);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const lastEnabledIndex = [...items]
        .map((item, itemIndex) => ({ item, itemIndex }))
        .reverse()
        .find(({ item }) => !item.disabled)?.itemIndex ?? -1;
      moveFocus(lastEnabledIndex);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!items[index]?.disabled) {
        onSelect(items[index].id);
        closeMenu();
      }
    }
  }

  const menuAlignment = align === "end" ? "right-0" : "left-0";
  const triggerIcon = isElementNode(icon)
    ? cloneElement(icon, {
        size: 22,
      } as never)
    : icon;

  return (
    <div className={joinClasses("relative inline-flex", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={joinClasses(
          "inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-300 active:bg-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        )}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        {triggerIcon}
      </button>

      <div
        id={menuId}
        ref={menuRef}
        role="menu"
        aria-label={ariaLabel}
        aria-hidden={!open}
        className={joinClasses(
          "absolute top-[calc(100%+0.75rem)] z-30 w-[280px]  origin-top rounded-lg border border-zinc-200 bg-white p-4 shadow-xl transition duration-150 ease-out",
          menuAlignment,
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <div className="space-y-2 ">
          {items.map((item, index) => {
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={item.disabled}
                tabIndex={-1}
                className={joinClasses(
                  "flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-inset disabled:cursor-not-allowed disabled:text-zinc-400",
                  selected ? "bg-zinc-100 text-zinc-950" : "text-zinc-700 hover:bg-zinc-50",
                  item.disabled && "bg-transparent hover:bg-transparent",
                )}
                onClick={() => {
                  if (item.disabled) return;
                  onSelect(item.id);
                  closeMenu();
                }}
                onKeyDown={(event) => handleItemKeyDown(event, index)}
              >
                <span>{item.label}</span>
                {selected ? <Check size={18} weight="bold" /> : <span aria-hidden="true" className="h-[18px] w-[18px]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
