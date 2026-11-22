import clsx from "clsx";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui";

/**
 * Type-to-find box for customers and products (same feel as the stock ItemPicker):
 * every typed word must match; ↑/↓ to move, Enter to pick, Esc to close. Leaving the
 * box with exactly one match picks it. With `onCreate`, typing a name that isn't in the list
 * offers "Add “name”" at the foot of the list (the caller opens its own form).
 */
export function SearchPicker<T>({
  id,
  items,
  value,
  onChange,
  keyOf,
  labelOf,
  searchOf,
  meta,
  placeholder,
  invalid,
  autoFocus,
  onCreate,
  createLabel = "Add",
}: {
  id?: string;
  items: T[];
  value: T | null;
  onChange: (item: T | null) => void;
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  /** Lower-case text the words are matched against. */
  searchOf: (item: T) => string;
  /** Extra detail on the right of each option. */
  meta?: (item: T) => ReactNode;
  placeholder?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Offer to add what's typed when nothing has exactly that name. */
  onCreate?: (text: string) => void;
  /** The word in front of the typed name, e.g. "Add supplier". */
  createLabel?: string;
}) {
  const [text, setText] = useState(value ? labelOf(value) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Show the picked item's name. Typing clears the pick but keeps what's typed, so a
  // cleared value must NOT wipe the text (that would eat the first letter typed).
  useEffect(() => {
    if (value) setText(labelOf(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = words.length === 0 || (value && labelOf(value) === text) ? items : items.filter((i) => words.every((w) => searchOf(i).includes(w)));
    return list.slice(0, 50);
  }, [items, text, value]); // eslint-disable-line react-hooks/exhaustive-deps

  const typed = text.trim();
  const canCreate = Boolean(onCreate) && typed.length > 0 && !value && !items.some((i) => labelOf(i).trim().toLowerCase() === typed.toLowerCase());
  const optionCount = matches.length + (canCreate ? 1 : 0);
  const create = () => {
    setOpen(false);
    onCreate?.(typed);
  };

  const pick = (item: T) => {
    onChange(item);
    setText(labelOf(item));
    setOpen(false);
  };

  const settle = () => {
    setOpen(false);
    if (value || !text.trim()) return;
    if (matches.length === 1) pick(matches[0]!);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) settle();
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  });

  return (
    <div ref={boxRef} className="relative">
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        invalid={invalid}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onFocus={(e) => {
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
            setActive((a) => Math.min(a + 1, optionCount - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === "Enter" && open && canCreate && active === matches.length) {
            e.preventDefault();
            create();
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && optionCount > 0 ? (
        <ul role="listbox" className="absolute top-full left-0 z-30 mt-1 max-h-72 w-max max-w-[min(560px,85vw)] min-w-full overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-pop">
          {matches.map((item, i) => (
            <li
              key={keyOf(item)}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx("flex min-h-8 cursor-default items-center gap-3 rounded-[6px] px-2.5 py-1 text-body", i === active ? "bg-surface-alt" : null)}
            >
              <span className="min-w-0 flex-1 truncate text-ink" title={labelOf(item)}>
                {labelOf(item)}
              </span>
              {meta ? <span className="shrink-0 text-caption text-ink-subtle">{meta(item)}</span> : null}
            </li>
          ))}
          {canCreate ? (
            <li
              role="option"
              aria-selected={active === matches.length}
              onMouseDown={(e) => {
                e.preventDefault();
                create();
              }}
              onMouseEnter={() => setActive(matches.length)}
              className={clsx(
                "flex min-h-8 cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1 text-body font-medium text-accent",
                matches.length > 0 && "mt-1 border-t border-line-row pt-1.5",
                active === matches.length ? "bg-surface-alt" : null,
              )}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                {createLabel} “{typed}”
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
