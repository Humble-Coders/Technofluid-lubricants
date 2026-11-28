import clsx from "clsx";
import { Building2, Check, ChevronsUpDown, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { MAIN_LINE, companyPeriodIn } from "@technofluid/core";
import { useCompany } from "./CompanyContext";

/**
 * The current company, and (for Admin, when there's more than one) the way to switch —
 * shown in two places so it's easy to find: a highlighted card in the sidebar, and a bar at
 * the top of the Dashboard. Everyone else sees which company / year they're in.
 */
export function CompanySwitcher({ variant, collapsed = false }: { variant: "sidebar" | "page"; collapsed?: boolean }) {
  const { company, companies, companyId, switchTo, canSwitch } = useCompany();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
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

  const name = company?.name || "Technofluid Lubricants";
  const period = company ? companyPeriodIn(company, companies) : null;
  const kind = company && company.line !== MAIN_LINE ? "Money only" : "Main business";
  const shown = companies.filter((c) => (!c.archived || c.id === companyId) && !c.accessLost);

  const list = open ? (
    <div
      role="listbox"
      aria-label="Companies"
      className={clsx(
        "absolute z-40 mt-1 max-h-80 min-w-72 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-pop",
        variant === "sidebar" ? (collapsed ? "top-0 left-full ml-2" : "top-full left-0") : "top-full right-0",
      )}
    >
      <p className="px-2.5 pt-1.5 pb-1 text-caption font-medium text-ink-subtle">Switch company</p>
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
          className={clsx("flex w-full items-start gap-2 rounded-[6px] px-2.5 py-1.5 text-left hover:bg-surface-alt", c.id === companyId && "bg-accent-50")}
        >
          <Check className={clsx("mt-0.5 size-4 shrink-0 text-accent", c.id !== companyId && "invisible")} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-body font-medium text-ink">{c.name}</span>
            <span className="block text-caption text-ink-muted">
              {companyPeriodIn(c, companies)} · {c.line === MAIN_LINE ? "Main business" : "Money only"}
            </span>
          </span>
        </button>
      ))}
      {shown.length <= 1 ? <p className="px-2.5 py-1.5 text-caption text-ink-muted">Only one company so far. Add a company or a new financial year to switch between them.</p> : null}
      <div className="mt-1 border-t border-line-row pt-1">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            navigate("/companies");
          }}
          className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-body text-ink hover:bg-surface-alt"
        >
          <Settings2 className="size-4 shrink-0 text-ink-muted" aria-hidden />
          Add or manage companies
        </button>
      </div>
    </div>
  ) : null;

  if (variant === "page") {
    return (
      <div ref={box} className="relative mb-6 flex items-center gap-3 rounded-sheet border border-accent/30 bg-accent-50 px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface text-accent shadow-control">
          <Building2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-caption text-ink-muted">You're working in</p>
          <p className="truncate text-body font-semibold text-ink">
            {name}
            {period ? <span className="font-normal text-ink-muted"> · {period}</span> : null}
            <span className="font-normal text-ink-muted"> · {kind}</span>
          </p>
        </div>
        {canSwitch ? (
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-accent px-3 text-label font-medium text-white shadow-control transition-colors hover:bg-accent/90"
          >
            Switch company
            <ChevronsUpDown className="size-4" aria-hidden />
          </button>
        ) : null}
        {list}
      </div>
    );
  }

  // Sidebar: a highlighted card under the app name.
  const card = (
    <>
      <Building2 className="size-4 shrink-0 text-brand-orange" aria-hidden />
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[11px] font-medium tracking-wide text-white/50 uppercase">{canSwitch ? "Switch company" : "Company"}</span>
            <span className="block truncate text-label font-semibold text-white">{name}</span>
            {period ? <span className="block truncate text-caption text-white/60">{period}</span> : null}
          </span>
          {canSwitch ? <ChevronsUpDown className="size-4 shrink-0 text-white/70" aria-hidden /> : null}
        </>
      )}
    </>
  );
  const shell = clsx(
    "app-no-drag flex w-full items-center gap-2.5 rounded-control border border-brand-orange/50 bg-brand-orange/[0.12] py-2 transition-colors",
    collapsed ? "justify-center px-0" : "px-2.5",
  );
  return (
    <div ref={box} className={clsx("relative mb-3 shrink-0", collapsed ? "mx-auto w-10" : "mx-3")}>
      {canSwitch ? (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          title={collapsed ? `${name}${period ? ` · ${period}` : ""} — switch company` : undefined}
          className={clsx(shell, "hover:border-brand-orange hover:bg-brand-orange/[0.2]")}
        >
          {card}
        </button>
      ) : (
        <div className={shell} title={collapsed ? `${name}${period ? ` · ${period}` : ""}` : undefined}>
          {card}
        </div>
      )}
      {list}
    </div>
  );
}
