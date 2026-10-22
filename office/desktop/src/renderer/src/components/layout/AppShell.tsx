import clsx from "clsx";
import { BellRing, ChevronsUpDown, LogOut, PanelLeftClose, PanelLeftOpen, Search, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import mark from "@/assets/logo-mark.png";
import { modKey } from "@/components/ui";
import { navFor, ROLE_LABEL, type NavItem } from "@/lib/access";
import { usingEmulators } from "@/lib/firebase";
import { useOnline } from "@/hooks/useConnection";
import { useProductionRequests } from "@/hooks/useProductionRequests";
import { useRecipeRequests } from "@/hooks/useRecipeRequests";
import { useSession, useStaff } from "@/features/auth/session";
import { CommandPalette } from "./CommandPalette";

const isMac = (window.office?.platform ?? (navigator.platform.toLowerCase().includes("mac") ? "darwin" : "")) === "darwin";
const inDesktopApp = Boolean(window.office);

// Remembered per computer. Storage can be unavailable (private window, blocked site data),
// so the sidebar simply starts open if it can't be read.
const COLLAPSED_KEY = "office.sidebarCollapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Not remembered — fine.
  }
}

export function AppShell() {
  const { role } = useStaff();
  const navigate = useNavigate();
  const items = useMemo(() => navFor(role), [role]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => saveCollapsed(collapsed), [collapsed]);

  // Keyboard: ⌘/Ctrl+K opens the palette; ⌘/Ctrl+B collapses the sidebar; ⌘/Ctrl+1…6 jumps to a screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
        return;
      }
      const target = items.find((i) => i.shortcut === e.key);
      if (target) {
        e.preventDefault();
        navigate(target.path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, navigate]);

  return (
    <div className="flex h-full">
      <Sidebar
        items={items}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onSearch={() => setPaletteOpen(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar items={items} />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={items} />
    </div>
  );
}

/* ─── Sidebar ─────────────────────────────────────────────────────────────────── */

function Sidebar({
  items,
  collapsed,
  onToggle,
  onSearch,
}: {
  items: NavItem[];
  collapsed: boolean;
  onToggle: () => void;
  onSearch: () => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of items) map.set(item.group, [...(map.get(item.group) ?? []), item]);
    return [...map.entries()];
  }, [items]);

  return (
    // Collapsed width still clears the Mac traffic lights (they end at ~68px).
    <aside
      className={clsx(
        "flex shrink-0 flex-col bg-brand-charcoal text-white/80 transition-[width] duration-150 ease-out",
        collapsed ? "w-[72px]" : "w-[232px]",
      )}
    >
      {/* Room for the Mac traffic lights; draggable. */}
      <div
        className={clsx(
          "app-drag flex shrink-0 items-end pb-3",
          collapsed ? "justify-center px-2" : "px-4",
          isMac && inDesktopApp ? "h-[68px]" : "h-14",
        )}
      >
        <div className="flex items-center gap-2.5">
          <img src={mark} alt="" aria-hidden className="size-6" />
          {collapsed ? null : (
            <span className="text-[13px] font-semibold tracking-wide whitespace-nowrap text-white">Technofluid Office</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onSearch}
        title={collapsed ? `Search or jump to… (${modKey()} K)` : undefined}
        aria-label="Search or jump to"
        className={clsx(
          "mb-3 flex h-8 items-center gap-2 rounded-md bg-white/[0.07] text-[12px] text-white/50 transition-colors hover:bg-white/[0.12] hover:text-white/80",
          collapsed ? "mx-auto w-10 justify-center" : "mx-3 px-2.5",
        )}
      >
        <Search className="size-3.5 shrink-0" />
        {collapsed ? null : (
          <>
            <span className="flex-1 truncate text-left">Search or jump to…</span>
            <span className="text-2xs text-white/40">{modKey()} K</span>
          </>
        )}
      </button>

      <nav className="flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3" aria-label="Main">
        {groups.map(([group, groupItems], index) => (
          <div key={group} className="mb-3">
            {collapsed ? (
              index > 0 ? <div className="mx-3 mb-2 h-px bg-white/[0.08]" aria-hidden /> : null
            ) : (
              <p className="px-2.5 pt-2 pb-1 text-2xs font-medium tracking-wider whitespace-nowrap text-white/35 uppercase">
                {group}
              </p>
            )}
            {groupItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                title={collapsed ? (item.shortcut ? `${item.label} (${modKey()}${item.shortcut})` : item.label) : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  clsx(
                    "group relative flex h-8 items-center gap-2.5 rounded-md text-[13px] transition-colors",
                    collapsed ? "justify-center" : "px-2.5",
                    isActive ? "bg-white/[0.1] font-medium text-white" : "hover:bg-white/[0.06] hover:text-white",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? <span className="absolute left-0 h-4 w-[3px] rounded-r bg-brand-orange" aria-hidden /> : null}
                    <item.icon
                      className={clsx("size-4 shrink-0", isActive ? "text-brand-orange" : "text-white/50 group-hover:text-white/80")}
                    />
                    {collapsed ? null : (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.shortcut ? (
                          <span className="text-2xs text-white/25 opacity-0 transition-opacity group-hover:opacity-100">
                            {modKey()}
                            {item.shortcut}
                          </span>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? `Expand sidebar (${modKey()} B)` : undefined}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className={clsx(
          "group mb-1 flex h-8 items-center gap-2.5 rounded-md text-[12px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white",
          collapsed ? "mx-auto w-10 justify-center" : "mx-2 px-2.5",
        )}
      >
        {collapsed ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
        {collapsed ? null : (
          <>
            <span className="flex-1 truncate text-left">Collapse sidebar</span>
            <span className="text-2xs text-white/25 opacity-0 transition-opacity group-hover:opacity-100">{modKey()}B</span>
          </>
        )}
      </button>

      <UserMenu collapsed={collapsed} />
    </aside>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { profile, role } = useStaff();
  const { signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const initials = profile.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative border-t border-white/[0.08] p-2">
      {open ? (
        <div
          className={clsx(
            "absolute bottom-full left-2 z-20 mb-1 rounded-md border border-line bg-surface p-1 text-ink shadow-pop",
            // Collapsed sidebar is too narrow for the menu — let it spill over the page.
            collapsed ? "w-[220px]" : "right-2",
          )}
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-medium">{profile.name}</p>
            <p className="truncate text-[12px] text-ink-muted">{profile.email || ROLE_LABEL[role]}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-8 w-full items-center gap-2 rounded px-2.5 text-[13px] text-ink hover:bg-hover"
          >
            <LogOut className="size-3.5 text-ink-muted" />
            Sign out
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={collapsed ? `${profile.name}, ${ROLE_LABEL[role]}` : undefined}
        title={collapsed ? `${profile.name} · ${ROLE_LABEL[role]}` : undefined}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-md py-1.5 text-left transition-colors hover:bg-white/[0.06]",
          collapsed ? "justify-center" : "px-2",
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-orange text-2xs font-semibold text-white">
          {initials || "?"}
        </span>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-white">{profile.name}</span>
              <span className="block truncate text-2xs text-white/45">{ROLE_LABEL[role]}</span>
            </span>
            <ChevronsUpDown className="size-3.5 text-white/40" />
          </>
        )}
      </button>
    </div>
  );
}

/* ─── Top bar ─────────────────────────────────────────────────────────────────── */

function TopBar({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  const online = useOnline();
  const current = items.find((i) => (i.path === "/" ? pathname === "/" : pathname.startsWith(i.path)));

  return (
    <header
      className={clsx(
        "app-drag relative flex h-11 shrink-0 items-center gap-3 bg-gradient-to-r from-brand-orange to-[#f39a5f] px-5 text-white",
        // Leave room for the Windows minimise/maximise/close overlay.
        !isMac && inDesktopApp && "pr-[150px]",
      )}
    >
      <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold text-white">
        {current?.label ?? "Technofluid Office"}
      </h1>
      <div className="flex-1" />
      {usingEmulators ? (
        <span className="inline-flex h-5 items-center rounded bg-white/20 px-1.5 text-2xs font-medium text-white">Test data</span>
      ) : null}
      <ApprovalsBell />
      <span
        className={clsx(
          "app-no-drag inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-2xs font-medium",
          online ? "bg-white/20 text-white" : "bg-white text-warning",
        )}
        title={online ? "Connected — changes save instantly" : "Offline — you can keep working; changes sync when the internet is back"}
      >
        {online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
        {online ? "Online" : "Offline — will sync"}
      </span>
      <span className="hidden items-center gap-1 text-2xs lg:flex" title="Search or jump to">
        {[modKey(), "K"].map((k) => (
          <kbd key={k} className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-white/20 px-1 font-sans text-2xs text-white">
            {k}
          </kbd>
        ))}
      </span>
    </header>
  );
}

/** Admin only: how many approvals are waiting; click to open them. */
function ApprovalsBell() {
  const { role } = useStaff();
  const navigate = useNavigate();
  const pending = useRecipeRequests(role === "admin" ? { pending: true } : null);
  const runs = useProductionRequests(role === "admin" ? { pending: true } : null);
  if (role !== "admin") return null;
  const count = (pending.status === "ready" ? pending.data.length : 0) + (runs.status === "ready" ? runs.data.length : 0);
  return (
    <button
      type="button"
      onClick={() => navigate("/approvals")}
      title={count ? `${count} waiting for your approval` : "Approvals"}
      aria-label={count ? `${count} ${count === 1 ? "approval" : "approvals"} waiting` : "Approvals"}
      className="app-no-drag relative inline-flex size-7 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white"
    >
      <BellRing className="size-4" />
      {count > 0 ? (
        <span className="num absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] leading-4 font-semibold text-brand-orange">
          {count}
        </span>
      ) : null}
    </button>
  );
}
