import clsx from "clsx";
import { CornerDownLeft, LogOut, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useNavigate } from "react-router";
import { Kbd } from "@/components/ui";
import type { NavItem } from "@/lib/access";
import { useSession } from "@/features/auth/session";

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  run(): void;
}

/**
 * Keyboard-first navigation (⌘K / Ctrl+K): type to filter, ↑↓ to move, Enter to run,
 * Esc to close. Later this also searches products, customers and invoices.
 */
export function CommandPalette({ open, onClose, items }: { open: boolean; onClose: () => void; items: NavItem[] }) {
  const navigate = useNavigate();
  const { signOut } = useSession();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      ...items.map((item) => ({
        id: item.path,
        label: item.label,
        hint: "Go to",
        icon: item.icon,
        run: () => navigate(item.path),
      })),
      { id: "sign-out", label: "Sign out", hint: "Account", icon: LogOut, run: () => void signOut() },
    ],
    [items, navigate, signOut],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const runAt = (index: number) => {
    const command = filtered[index];
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 pt-[14vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runAt(active);
              }
            }}
            placeholder="Search screens and actions…"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-faint"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul className="max-h-[320px] overflow-y-auto p-1.5" role="listbox">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-ink-muted">Nothing matches "{query}"</li>
          ) : (
            filtered.map((command, index) => (
              <li
                key={command.id}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => runAt(index)}
                className={clsx(
                  "flex h-9 cursor-default items-center gap-3 rounded-md px-3 text-[13px]",
                  index === active ? "bg-brand-orange/10 text-ink" : "text-ink-muted",
                )}
              >
                <command.icon className={clsx("size-4", index === active ? "text-brand-orange" : "text-ink-faint")} />
                <span className="flex-1 truncate text-ink">{command.label}</span>
                <span className="text-2xs text-ink-faint">{command.hint}</span>
                {index === active ? <CornerDownLeft className="size-3.5 text-ink-faint" /> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
