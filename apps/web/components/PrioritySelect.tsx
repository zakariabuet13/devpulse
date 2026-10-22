"use client";

import type { Priority } from "@devpulse/shared";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/boardLogic";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { PriorityIcon } from "./PriorityIcon";

type Props = {
  value: Priority;
  onChange: (priority: Priority) => void;
  label: string; // accessible context, e.g. "#369"
};

// Button + listbox popover (not a dialog). Focus moves to the listbox while open; the active
// option is tracked with `aria-activedescendant`.
export function PrioritySelect({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openMenu() {
    setActive(PRIORITIES.indexOf(value));
    setOpen(true);
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function select(p: Priority) {
    close(true);
    if (p !== value) onChange(p);
  }

  function onButtonKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu();
    }
  }

  function onListKeyDown(e: KeyboardEvent) {
    const n = PRIORITIES.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (i + 1) % n);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (i - 1 + n) % n);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(n - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        select(PRIORITIES[active]);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`Priority for ${label}: ${PRIORITY_LABEL[value]}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
        className={`flex h-6 items-center gap-1.5 rounded border bg-white pl-1.5 pr-1 text-[11px] font-medium text-zinc-900 ${
          open ? "border-zinc-900" : "border-zinc-200 hover:border-zinc-300"
        }`}
      >
        <PriorityIcon priority={value} size={12} />
        {PRIORITY_LABEL[value]}
        <ChevronDownIcon width={12} height={12} className="text-zinc-600" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
          <div
            id={`${id}-heading`}
            className="px-3 pb-2 pt-2 font-mono text-[10px] uppercase tracking-wide text-zinc-500"
          >
            Change priority
          </div>
          <ul
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={`${id}-heading`}
            aria-activedescendant={`${id}-${PRIORITIES[active]}`}
            onKeyDown={onListKeyDown}
            className="outline-none"
          >
            {PRIORITIES.map((p, i) => (
              <li
                key={p}
                id={`${id}-${p}`}
                role="option"
                aria-selected={p === value}
                onClick={() => select(p)}
                onMouseEnter={() => setActive(i)}
                className={`flex h-[34px] cursor-pointer items-center gap-2.5 rounded px-3 text-[13px] text-zinc-900 ${
                  i === active ? "bg-zinc-100" : ""
                } ${p === value ? "font-medium" : ""}`}
              >
                <PriorityIcon priority={p} />
                {PRIORITY_LABEL[p]}
                {p === value && (
                  <CheckIcon width={16} height={16} className="ml-auto" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
