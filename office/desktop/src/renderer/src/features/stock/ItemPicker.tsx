import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui";
import type { StockItem } from "@/services/stockService";
import { KIND_LABEL, searchText } from "./stockFormat";

/**
 * Type-to-find stock item box: matches name, recipe code and other names.
 * ↑/↓ to move, Enter to pick, Esc to close.
 */
export function ItemPicker({
  id,
  items,
  value,
  onChange,
  invalid,
  autoFocus,
  className,
  chevron = false,
}: {
  id?: string;
  items: StockItem[];
  value: StockItem | null;
  onChange: (item: StockItem | null) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Extra classes for the box, e.g. a taller height. */
  className?: string;
  /** Show a ▾ at the right, like a dropdown. */
  chevron?: boolean;
}) {
  const [text, setText] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Show the picked item's name; typing clears the pick but keeps what's typed.
  useEffect(() => {
    if (value) setText(value.name);
  }, [value]);

  const matches = useMemo(() => {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = words.length === 0 || value?.name === text ? items : items.filter((i) => words.every((w) => searchText(i).includes(w)));
    return list.slice(0, 40);
  }, [items, text, value]);

  /**
   * Leaving the box without choosing from the list: if what was typed is one item's
   * name, or only one item matches, take it — otherwise keep the text so the person
   * sees what they typed (the line then asks them to choose).
   */
  const settle = () => {
    setOpen(false);
    if (value || !text.trim()) return;
    const t = text.trim().toLowerCase();
    const exact = items.find((i) => i.name.toLowerCase() === t || i.code === t);
    const only = matches.length === 1 ? matches[0] : undefined;
    const chosen = exact ?? only;
    if (chosen) pick(chosen);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) settle();
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  });

  const pick = (item: StockItem) => {
    onChange(item);
    setText(item.name);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        id={id}
        className={clsx(className, chevron && "[&_input]:pr-8")}
        value={text}
        placeholder="Type to find an item"
        invalid={invalid}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onFocus={(e) => {
          // Typing into a filled box replaces the item rather than editing its name.
          e.target.select();
          setOpen(true);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
          if (value) onChange(null);
        }}
        onBlur={() => settle()}
        onKeyDown={(e) => {
          if (e.key === "Tab") settle();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {chevron ? (
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
      ) : null}
      {open && matches.length > 0 ? (
        <ul
          role="listbox"
          className="absolute top-full left-0 z-30 mt-1 max-h-64 w-max max-w-[min(440px,80vw)] min-w-full overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-pop"
        >
          {matches.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx(
                "flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-[13px]",
                i === active ? "bg-hover" : null,
              )}
            >
              <span className="min-w-0 flex-1 truncate text-ink" title={item.name}>
                {item.name}
              </span>
              {item.code ? <span className="font-mono text-[11px] text-ink-faint">{item.code}</span> : null}
              <span className="text-2xs text-ink-faint">{KIND_LABEL[item.kind]}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
