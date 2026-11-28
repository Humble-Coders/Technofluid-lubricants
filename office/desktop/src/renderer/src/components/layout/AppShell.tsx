import clsx from "clsx";
import { ChevronsUpDown, Download, FlaskConical, LogOut, PanelLeftClose, PanelLeftOpen, Search, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import mark from "@/assets/logo-mark.png";
import { modKey, SheetOverlayContext } from "@/components/ui";
import { updateActions, useUpdate } from "@/features/updates/updateStore";
import { navFor, ROLE_LABEL, type NavItem } from "@/lib/access";
import { usingEmulators } from "@/lib/firebase";
import { useOnline } from "@/hooks/useConnection";
import { useProductionRequests } from "@/hooks/useProductionRequests";
import { useRecipeRequests } from "@/hooks/useRecipeRequests";
import { useRealBooks } from "@/hooks/useSales";
import { useSession, useStaff } from "@/features/auth/session";
import { CommandPalette } from "./CommandPalette";
import { CompanyProvider, useCompany } from "@/features/companies/CompanyContext";
import { Banner } from "@/components/ui";
import { companyPeriodIn } from "@technofluid/core";

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
  return (
    <CompanyProvider>
      <Shell />
    </CompanyProvider>
  );
}

function Shell() {
  const { role } = useStaff();
  const { companyId, company } = useCompany();
  const navigate = useNavigate();
  const items = useMemo(() => navFor(role), [role]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);

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
    <div className="flex h-full bg-canvas">
      <Sidebar
        items={items}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onSearch={() => setPaletteOpen(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar items={items} />
        {/* ONE white sheet per screen, inset 8px. Every screen is a <Page> (or a <Workspace>) inside it.
            The overlay layer above it is where <SidePanel>s open, over the sheet's right side. */}
        <div className="relative m-2 min-h-0 flex-1">
          <main className="absolute inset-0 overflow-auto rounded-sheet border border-line bg-surface shadow-card">
            <SheetOverlayContext.Provider value={overlay}>
              {company && company.line !== "main" ? (
                <Banner tone="info" className="mx-8 mt-4">
                  You're working in <strong>{company.name}</strong> — separate, money-only books. Money in &amp; out, expenses, cash &amp; bank and balances show this company;
                  sales, purchases and stock belong to the main business.
                </Banner>
              ) : null}
              {/* A new key per company: every screen reloads its data when the company changes. */}
              <Outlet key={companyId} />
            </SheetOverlayContext.Provider>
          </main>
          <div ref={setOverlay} className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-sheet" />
        </div>
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

  const waiting = useApprovalsWaiting();

  return (
    // Collapsed width still clears the Mac traffic lights (they end at ~68px).
    <aside className={clsx("flex shrink-0 flex-col bg-sidebar text-white/70 transition-[width] duration-150 ease-out", collapsed ? "w-[72px]" : "w-[232px]")}>
      {/* Room for the Mac traffic lights; draggable. */}
      <div className={clsx("app-drag flex shrink-0 items-end pb-4", collapsed ? "justify-center px-2" : "px-4", isMac && inDesktopApp ? "h-[84px]" : "h-16")}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-white/[0.08]">
            <img src={mark} alt="" aria-hidden className="size-5" />
          </span>
          {collapsed ? null : (
            <span className="min-w-0">
              <span className="block truncate text-body font-semibold text-white">Technofluid Office</span>
              <CompanySwitcher />
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onSearch}
        title={collapsed ? `Search or jump to… (${modKey()} K)` : undefined}
        aria-label="Search or jump to"
        className={clsx(
          "mb-2 flex h-8 shrink-0 items-center gap-2 rounded-control bg-white/[0.07] text-label text-white/50 transition-colors hover:bg-white/[0.12] hover:text-white/80",
          collapsed ? "mx-auto w-10 justify-center" : "mx-3 px-2.5",
        )}
      >
        <Search className="size-4 shrink-0 opacity-70" />
        {collapsed ? null : (
          <>
            <span className="flex-1 truncate text-left">Search or jump to…</span>
            <span className="text-caption text-white/35">{modKey()} K</span>
          </>
        )}
      </button>

      <nav className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3" aria-label="Main">
        {groups.map(([group, groupItems], index) => (
          <div key={group} className="mb-2">
            {collapsed ? (
              index > 0 ? <div className="mx-2 mb-2 h-px bg-white/[0.08]" aria-hidden /> : null
            ) : (
              <p className="px-2.5 pt-3 pb-1 text-caption whitespace-nowrap text-white/40">{group}</p>
            )}
            {groupItems.map((item) => {
              const count = item.path === "/approvals" ? waiting : 0;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  title={item.shortcut ? `${item.label} (${modKey()}${item.shortcut})` : collapsed ? item.label : undefined}
                  aria-label={collapsed ? (count ? `${item.label}, ${count} waiting` : item.label) : undefined}
                  className={({ isActive }) =>
                    clsx(
                      "group relative flex h-8 items-center gap-2.5 rounded-control text-body font-medium transition-colors",
                      collapsed ? "justify-center" : "px-2.5",
                      isActive ? "bg-sidebar-active text-white" : "hover:bg-white/[0.06] hover:text-white",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? <span className="absolute -left-3 h-5 w-[3px] rounded-r bg-brand-orange" aria-hidden /> : null}
                      <item.icon className={clsx("size-4 shrink-0", isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100")} />
                      {collapsed ? (
                        count ? <span className="absolute top-1 right-2 size-2 rounded-full bg-brand-orange" aria-hidden /> : null
                      ) : (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {count ? (
                            <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange px-1.5 text-caption font-semibold text-sidebar" title={`${count} waiting for your approval`}>
                              {count}
                            </span>
                          ) : null}
                        </>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <UpdateButton collapsed={collapsed} />
      <StatusNotes collapsed={collapsed} />

      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? `Expand sidebar (${modKey()} B)` : undefined}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className={clsx(
          "group mb-1 flex h-8 shrink-0 items-center gap-2.5 rounded-control text-label text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white",
          collapsed ? "mx-auto w-10 justify-center" : "mx-3 px-2.5",
        )}
      >
        {collapsed ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
        {collapsed ? null : (
          <>
            <span className="flex-1 truncate text-left">Collapse sidebar</span>
            <span className="text-caption text-white/30 opacity-0 transition-opacity group-hover:opacity-100">{modKey()}B</span>
          </>
        )}
      </button>

      <UserMenu collapsed={collapsed} />

      {/* Which version this is, for when someone reports a problem. */}
      <p className={clsx("selectable shrink-0 pb-2 text-caption text-white/30", collapsed ? "text-center" : "px-5")} title="App version">
        {collapsed ? `v${__APP_VERSION__}` : `Version ${__APP_VERSION__}`}
      </p>
    </aside>
  );
}

/** Admin only: how many approvals are waiting (shown on the Approvals row). */
function useApprovalsWaiting(): number {
  const { role } = useStaff();
  const pending = useRecipeRequests(role === "admin" ? { pending: true } : null);
  const runs = useProductionRequests(role === "admin" ? { pending: true } : null);
  if (role !== "admin") return 0;
  return (pending.status === "ready" ? pending.data.length : 0) + (runs.status === "ready" ? runs.data.length : 0);
}

/**
 * Exceptions only, above the user: working offline, and which data this is when it isn't the
 * live company. When everything is normal (online, live data) nothing shows.
 */
function StatusNotes({ collapsed }: { collapsed: boolean }) {
  const online = useOnline();
  const realBooks = useRealBooks();
  const notes: Array<{ key: string; icon: typeof WifiOff; label: string; title: string; tone: string }> = [];
  if (!online)
    notes.push({ key: "offline", icon: WifiOff, label: "Offline, will sync", title: "Offline. You can keep working; changes sync when the internet is back", tone: "bg-warning-soft text-warning" });
  if (usingEmulators && realBooks)
    notes.push({ key: "real", icon: FlaskConical, label: "Real books", title: "These test emulators post to Technofluid's real Humble Ledger company", tone: "bg-danger-fill text-white" });
  else if (usingEmulators) notes.push({ key: "test", icon: FlaskConical, label: "Test data", title: "This is test data on this computer, not Technofluid's live company", tone: "bg-white/[0.1] text-white/80" });
  if (notes.length === 0) return null;
  return (
    <div className={clsx("mb-2 flex shrink-0 flex-col gap-1", collapsed ? "items-center" : "px-3")}>
      {notes.map((n) => (
        <span
          key={n.key}
          role="status"
          title={n.title}
          aria-label={collapsed ? n.label : undefined}
          className={clsx("inline-flex h-7 items-center gap-2 rounded-control text-label font-medium", collapsed ? "w-10 justify-center" : "px-2.5", n.tone)}
        >
          <n.icon className="size-4 shrink-0" />
          {collapsed ? null : n.label}
        </span>
      ))}
    </div>
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
            "absolute bottom-full left-2 z-20 mb-1 rounded-control border border-line bg-surface p-1 text-ink shadow-pop",
            // Collapsed sidebar is too narrow for the menu — let it spill over the page.
            collapsed ? "w-[220px]" : "right-2",
          )}
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-body font-medium">{profile.name}</p>
            <p className="truncate text-caption text-ink-muted">{profile.email || ROLE_LABEL[role]}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2.5 text-body text-ink hover:bg-surface-alt"
          >
            <LogOut className="size-4 text-ink-muted" />
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
          "flex w-full items-center gap-2.5 rounded-control py-1.5 text-left transition-colors hover:bg-white/[0.06]",
          collapsed ? "justify-center" : "px-2",
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-caption font-semibold text-white">
          {initials || "?"}
        </span>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label font-medium text-white">{profile.name}</span>
              <span className="block truncate text-caption text-white/45">{ROLE_LABEL[role]}</span>
            </span>
            <ChevronsUpDown className="size-4 text-white/40" />
          </>
        )}
      </button>
    </div>
  );
}

/* ─── Top bar ─────────────────────────────────────────────────────────────────── */

/** The orange bar above the sheet with the screen's name. Drags the window; on Windows the
 *  minimise/maximise/close buttons sit at its right end (main/index.ts colours them to match). */
function TopBar({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  const current = items.find((i) => (i.path === "/" ? pathname === "/" : pathname.startsWith(i.path)));
  return (
    <header
      className={clsx(
        "app-drag relative flex h-11 shrink-0 items-center bg-gradient-to-r from-brand-orange to-[#f39a5f] text-white",
        !isMac && inDesktopApp && "pr-[150px]",
      )}
    >
      <h1 className="pointer-events-none absolute left-1/2 max-w-[50%] -translate-x-1/2 truncate text-[15px] font-semibold text-white">{current?.label ?? "Technofluid Office"}</h1>
    </header>
  );
}

/* ─── Update ──────────────────────────────────────────────────────────────────── */

/** After "Later" on the update pop-up: a way back to it, until the app restarts on the new version. */
function UpdateButton({ collapsed }: { collapsed: boolean }) {
  const { update, hidden } = useUpdate();
  if (!hidden || (update.kind !== "available" && update.kind !== "downloaded" && update.kind !== "error")) return null;
  const version = update.kind === "error" ? "" : update.version;
  const label = update.kind === "downloaded" ? "Restart to update" : update.kind === "error" ? "Update failed" : "Update available";
  return (
    <button
      type="button"
      onClick={updateActions.show}
      title={collapsed ? `${label}${version ? ` (${version})` : ""}` : undefined}
      aria-label={collapsed ? label : undefined}
      className={clsx(
        "mb-2 flex h-8 shrink-0 items-center gap-2.5 rounded-control bg-brand-orange text-label font-medium text-white transition-colors hover:bg-accent",
        collapsed ? "mx-auto w-10 justify-center" : "mx-3 px-2.5",
      )}
    >
      <Download className="size-4 shrink-0" />
      {collapsed ? null : (
        <>
          <span className="flex-1 truncate text-left">{label}</span>
          {version ? <span className="text-caption text-white/80">{version}</span> : null}
        </>
      )}
    </button>
  );
}

/** Under the app name: the current company — a list to switch, for Admin when there's more than one. */
function CompanySwitcher() {
  const { company, companies, companyId, switchTo, canSwitch } = useCompany();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  const label = company ? company.name : "Technofluid Lubricants";
  const period = company && companies.length > 1 ? companyPeriodIn(company, companies) : null;
  if (!canSwitch) return <span className="block truncate text-caption text-white/45">{label}</span>;
  const shown = companies.filter((c) => (!c.archived || c.id === companyId) && !c.accessLost);
  return (
    <span ref={box} className="app-no-drag relative block">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Switch company" className="flex max-w-full min-w-0 items-center gap-1 rounded text-caption text-white/60 hover:text-white">
        <span className="truncate">
          {label}
          {period ? ` · ${period}` : ""}
        </span>
        <ChevronsUpDown className="size-3 shrink-0" aria-hidden />
      </button>
      {open ? (
        <span role="listbox" aria-label="Companies" className="absolute top-full left-0 z-40 mt-1 block max-h-80 min-w-64 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-pop">
          {shown.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === companyId}
              onClick={() => {
                setOpen(false);
                switchTo(c.id);
              }}
              className={clsx("flex w-full flex-col rounded-[6px] px-2.5 py-1.5 text-left hover:bg-surface-alt", c.id === companyId && "bg-accent-50")}
            >
              <span className="text-body font-medium text-ink">{c.name}</span>
              <span className="text-caption text-ink-muted">
                {companyPeriodIn(c, companies)} · {c.line === "main" ? "Main business" : "Money only"}
              </span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
