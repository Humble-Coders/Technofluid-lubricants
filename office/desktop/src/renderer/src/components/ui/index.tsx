/**
 * The Technofluid Office kit (docs/office/ui-design-reference.md). Screens are built ONLY from
 * these pieces and the tokens in styles.css — no one-off colours or sizes in a screen. If a
 * screen needs something that isn't here, it is added here.
 *
 * The look, in one breath: one white sheet per screen, flat inside it (no boxes in boxes),
 * colour only where it means something, one primary button per page, 14px text, 32px controls,
 * 44px table rows.
 */
import clsx from "clsx";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, CircleAlert, Info, Loader2, MoreHorizontal, Search, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TdHTMLAttributes,
  type TextareaHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { Link } from "react-router";

/* ─── Button ───────────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white shadow-control hover:bg-accent-hover active:bg-accent-pressed disabled:bg-accent/45",
  secondary:
    "bg-surface text-ink border border-line-strong shadow-control hover:bg-surface-alt active:bg-line-row disabled:text-ink-faint disabled:shadow-none",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-alt hover:text-ink active:bg-line-row disabled:text-ink-faint disabled:hover:bg-transparent",
  danger: "bg-danger text-white shadow-control hover:bg-danger/90 active:bg-danger/80 disabled:bg-danger/45",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** One `primary` per page. Everything else is `secondary` or `ghost`; `danger` only inside a confirm. */
  variant?: ButtonVariant;
  /** `md` = 32px (default), `sm` = 28px (inside tables, toolbars, dense panels). */
  size?: ButtonSize;
  /** Shows a spinner and disables the button. Keep the label ("Saving…"). */
  loading?: boolean;
  /** A 16px lucide icon, shown on the left. */
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-colors disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0",
        size === "sm" ? "h-7 px-2.5 text-label" : "h-8 px-3 text-body",
        buttonStyles[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/** A square, icon-only ghost button. Always needs a `label` (read aloud, shown as a tooltip). */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "icon" | "children"> & { label: string; children: ReactNode }>(
  function IconButton({ label, size = "md", variant = "ghost", className, children, ...rest }, ref) {
    return (
      <Button ref={ref} variant={variant} size={size} aria-label={label} title={label} className={clsx("px-0", size === "sm" ? "w-7" : "w-8", className)} {...rest}>
        {children}
      </Button>
    );
  },
);

/* ─── Inputs ───────────────────────────────────────────────────────────────────── */

const controlBase =
  "w-full rounded-control border bg-surface text-body text-ink placeholder:text-ink-faint transition-colors focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 disabled:bg-surface-alt disabled:text-ink-subtle";
const controlEdge = (invalid?: boolean) => (invalid ? "border-danger-fill" : "border-line-strong hover:border-ink-faint");

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Something small in front of the text: a 16px icon, or "₹". */
  leading?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, leading, className, ...rest }, ref) {
  return (
    <div className={clsx("relative flex items-center", className)}>
      {leading ? <span className="pointer-events-none absolute left-2.5 flex items-center text-body text-ink-subtle [&_svg]:size-4">{leading}</span> : null}
      <input ref={ref} aria-invalid={invalid || undefined} className={clsx(controlBase, controlEdge(invalid), "h-8 px-2.5", leading ? "pl-8" : null)} {...rest} />
    </div>
  );
});

/**
 * A money field: ₹ in front, digits right-aligned in tabular figures, everything selected on
 * focus so typing replaces the amount. It is still a plain text input — parsing stays with the caller.
 */
export const MoneyInput = forwardRef<HTMLInputElement, Omit<InputProps, "leading">>(function MoneyInput({ invalid, className, onFocus, inputMode = "decimal", ...rest }, ref) {
  return (
    <div className={clsx("relative flex items-center", className)}>
      <span className="pointer-events-none absolute left-2.5 text-body text-ink-subtle">₹</span>
      <input
        ref={ref}
        inputMode={inputMode}
        aria-invalid={invalid || undefined}
        onFocus={(e) => {
          e.currentTarget.select();
          onFocus?.(e);
        }}
        className={clsx(controlBase, controlEdge(invalid), "num h-8 pr-2.5 pl-7 text-right")}
        {...rest}
      />
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { invalid, className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={clsx(controlBase, controlEdge(invalid), "resize-y px-2.5 py-1.5", className)} {...rest} />;
});

/** The search box of a page toolbar. ⌘/Ctrl+F puts the cursor in it. */
export const SearchInput = forwardRef<HTMLInputElement, Omit<InputProps, "leading" | "type"> & { onClear?: () => void }>(function SearchInput(
  { className, onClear, value, ...rest },
  forwarded,
) {
  const own = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f" && own.current) {
        e.preventDefault();
        own.current.focus();
        own.current.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className={clsx("relative flex items-center", className ?? "w-72")}>
      <Search className="pointer-events-none absolute left-2.5 size-4 text-ink-subtle" aria-hidden />
      <input
        ref={(node) => {
          own.current = node;
          if (typeof forwarded === "function") forwarded(node);
          else if (forwarded) forwarded.current = node;
        }}
        type="text"
        value={value}
        className={clsx(controlBase, controlEdge(false), "h-8 pr-8 pl-8")}
        {...rest}
      />
      {onClear && value ? (
        <button type="button" aria-label="Clear search" onClick={onClear} className="absolute right-1.5 flex size-5 items-center justify-center rounded text-ink-subtle hover:bg-surface-alt hover:text-ink">
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, className, children, ...rest }, ref) {
  return (
    <div className={clsx("relative flex items-center", className)}>
      <select ref={ref} aria-invalid={invalid || undefined} className={clsx(controlBase, controlEdge(invalid), "h-8 appearance-none pr-8 pl-2.5")} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-ink-subtle" aria-hidden />
    </div>
  );
});

/** A tick box with its words beside it. */
export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: ReactNode }>(function Checkbox(
  { label, className, ...rest },
  ref,
) {
  const box = <input ref={ref} type="checkbox" className="size-4 shrink-0 rounded border-line-strong accent-accent" {...rest} />;
  if (!label) return box;
  return (
    <label className={clsx("inline-flex items-center gap-2 text-body text-ink", className)}>
      {box}
      {label}
    </label>
  );
});

/* ─── Switch (on/off) ──────────────────────────────────────────────────────────── */

export function Switch({ id, checked, onChange, label, disabled }: { id?: string; checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span className={clsx("inline-block size-4 rounded-full bg-white shadow-control transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

/* ─── Segmented control and tabs ───────────────────────────────────────────────── */

/** A small either/or switch between a few views of the SAME thing (e.g. "By pack | By product"). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  wide = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
  /** Fill the whole width, each option an equal share. */
  wide?: boolean;
}) {
  return (
    <div className={clsx("h-8 items-center rounded-control bg-surface-alt p-0.5 ring-1 ring-line ring-inset", wide ? "flex w-full" : "inline-flex")} role="radiogroup">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={clsx(
            "h-full rounded-[6px] px-3 text-label font-medium whitespace-nowrap transition-colors",
            wide && "flex-1",
            value === key ? "bg-surface text-ink shadow-control" : "text-ink-muted hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** The sections of a screen (e.g. Stock: "Live stock | Daily journal | History"). Underlined, accent rule on the current one. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  /** [key, label, optional count shown after the label] */
  options: Array<[T, string, (number | undefined)?]>;
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx("flex gap-6 border-b border-line", className)}>
      {options.map(([key, label, count]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={clsx(
            "-mb-px flex h-10 items-center gap-1.5 border-b-2 text-body font-medium whitespace-nowrap transition-colors",
            value === key ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {label}
          {count ? <span className="num rounded-badge bg-surface-alt px-1.5 text-caption text-ink-muted">{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ─── Form field: label above, control, then the error or a hint ───────────────── */

export function Field({
  label,
  htmlFor,
  error,
  help,
  optional,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  help?: string;
  /** Adds a quiet "optional" after the label. */
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-label font-medium text-ink">
        {label}
        {optional ? <span className="ml-1 font-normal text-ink-subtle">optional</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : help ? (
        <p className="text-caption text-ink-subtle">{help}</p>
      ) : null}
    </div>
  );
}

/* ─── Badge ─────────────────────────────────────────────────────────────────────── */

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const toneStyles: Record<Tone, string> = {
  neutral: "bg-surface-alt text-ink-muted ring-1 ring-line ring-inset",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  brand: "bg-accent-50 text-accent",
};

/**
 * A small tinted label, for EXCEPTIONS only. The normal state shows no badge at all: a saved
 * record shows nothing; only "Saving to books…" or "Not saved" earn one.
 */
export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx("inline-flex h-[22px] items-center gap-1 rounded-badge px-1.5 text-caption font-medium whitespace-nowrap [&_svg]:size-3.5", toneStyles[tone], className)}>
      {children}
    </span>
  );
}

/* ─── Small pieces ─────────────────────────────────────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("size-4 animate-spin text-ink-faint", className)} aria-label="Loading" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface px-1 font-sans text-2xs text-ink-muted">{children}</kbd>;
}

/**
 * A bordered box. Use it RARELY — the sheet is already the surface, and a box inside it is the
 * thing that makes screens look busy. Fine for: a floating panel over the canvas (sign-in), or
 * a block that must read as a separate object (an invoice preview frame). Never a card in a card.
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("rounded-sheet border border-line bg-surface", className)}>{children}</div>;
}

/** Platform-aware shortcut label: ⌘K on Mac, Ctrl K on Windows. */
export function modKey(): string {
  return window.office?.platform === "darwin" || navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
}

/* ─── States: empty, loading, error; and the banner ───────────────────────────── */

/** Nothing here yet: an icon, one line, and the action that fixes it. */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="mb-1 text-ink-faint [&_svg]:size-6">{icon}</div> : null}
      <h3 className="text-title font-semibold text-ink">{title}</h3>
      {children ? <p className="max-w-md text-body text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** The first load of a screen or a section. */
export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={clsx("flex min-h-40 items-center justify-center gap-2 text-body text-ink-muted", className)}>
      <Spinner /> {label}
    </div>
  );
}

/** A load that failed with nothing to show. (If old figures are on screen, keep them and use a <Banner tone="warning"> instead.) */
export function ErrorState({ title = "This couldn't be loaded", children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <CircleAlert className="size-6 text-danger-fill" aria-hidden />
      <h3 className="text-title font-semibold text-ink">{title}</h3>
      {children ? <p className="max-w-md text-body text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

const bannerStyles: Record<"info" | "success" | "warning" | "danger", string> = {
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
const bannerIcons = { info: Info, success: Check, warning: AlertTriangle, danger: CircleAlert };

/**
 * A line across the page or a form that says something went wrong, is out of date, or needs
 * attention — always an icon plus words, with an optional action on the right.
 */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = bannerIcons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={clsx("flex items-start gap-2.5 rounded-control px-3 py-2 text-label", bannerStyles[tone], className)}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={clsx(title && "mt-0.5")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ─── Page layout ──────────────────────────────────────────────────────────────── */

/**
 * Every screen is one <Page>: a single centred column on the white sheet (max 1152px, 32px side
 * padding), so the title, toolbar, table and footer all share one left and one right edge.
 *
 *   <Page>
 *     <PageHeader title="Sales" actions={<Button variant="primary">New sale</Button>} toolbar={…} />
 *     <StatTiles>…</StatTiles>
 *     <Table>…</Table>
 *   </Page>
 *
 * `fill` makes the page exactly as tall as the sheet (for a table that scrolls inside it): give
 * the scrolling child `min-h-0 flex-1 overflow-auto`.
 */
export function Page({ children, fill = false, className }: { children: ReactNode; fill?: boolean; className?: string }) {
  return <div className={clsx("mx-auto flex w-full max-w-[1152px] flex-col px-8 pt-6", fill ? "h-full min-h-0 pb-4" : "pb-10", className)}>{children}</div>;
}

/** "‹ Sales" above a record's title. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="-ml-1 mb-1 inline-flex h-6 items-center gap-0.5 self-start rounded pr-1.5 text-label font-medium text-ink-muted hover:text-accent">
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}

/**
 * The top of a page: a 20px title, an optional 13px subtitle, actions on the right (ONE primary,
 * one or two secondary, the rest in a <Menu>), and an optional toolbar row (search on the left,
 * filter pills after it).
 */
export function PageHeader({
  title,
  subtitle,
  back,
  badge,
  actions,
  toolbar,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A record page's way back: { to: "/sales", label: "Sales" }. */
  back?: { to: string; label: string };
  /** An exception badge beside the title (never the normal state). */
  badge?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("mb-6 flex shrink-0 flex-col", className)}>
      {back ? <BackLink to={back.to}>{back.label}</BackLink> : null}
      <div className="flex min-h-8 items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-page font-semibold text-ink">{title}</h1>
            {badge}
          </div>
          {subtitle ? <p className="mt-0.5 text-label text-ink-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {toolbar ? <div className="mt-4 flex flex-wrap items-center gap-2">{toolbar}</div> : null}
    </header>
  );
}

/**
 * A titled part of a page. Sections sit 40px apart and are separated by space and type alone —
 * no box around them.
 */
export function Section({ title, description, action, children, className }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("mt-10 first:mt-0 [header+&]:mt-0", className)}>
      {title || action ? (
        <div className="mb-3 flex items-end gap-3">
          <div className="min-w-0 flex-1">
            {title ? <h2 className="text-title font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-label text-ink-muted">{description}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A "workspace" screen (New sale, New purchase, Money in & out, Expenses): the list or the lines
 * on the left, and a full-height 384px form panel on the right whose total and main button stay
 * pinned at its foot. Put it directly in the route — it replaces <Page> and fills the sheet.
 */
export function Workspace({ children, panel }: { children: ReactNode; panel: ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-auto">{children}</div>
      {panel}
    </div>
  );
}

/** The right-hand panel of a <Workspace>. `footer` (total + the primary button) is pinned at the bottom. */
export function WorkspacePanel({ title, subtitle, children, footer, onClose }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; onClose?: () => void }) {
  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-line">
      {title ? (
        <div className="flex shrink-0 items-start gap-2 px-6 pt-6 pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-title font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-label text-ink-muted">{subtitle}</p> : null}
          </div>
          {onClose ? (
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X />
            </IconButton>
          ) : null}
        </div>
      ) : null}
      <div className={clsx("min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6", !title && "pt-6")}>{children}</div>
      {footer ? <div className="shrink-0 space-y-3 border-t border-line px-6 py-4">{footer}</div> : null}
    </aside>
  );
}

/* ─── Figures at the top of a screen ───────────────────────────────────────────── */

/** A row of equal tiles — NOT cards: a hairline on top, a 13px label, a 28px figure. */
export function StatTiles({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mb-8 grid auto-cols-fr grid-flow-col gap-6", className)}>{children}</div>;
}

/**
 * One figure. Plain text colour unless it is an exception (`tone`). With `onClick` the tile is a
 * filter and acts as a tab: the `active` one gets the accent rule.
 */
export function StatTile({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
  loading,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "success" | "warning" | "danger";
  active?: boolean;
  onClick?: () => void;
  loading?: boolean;
}) {
  const body = (
    <>
      <p className="text-label text-ink-muted">{label}</p>
      <p className={clsx("num mt-1 text-stat font-semibold", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-ink")}>
        {loading ? <Spinner className="my-2" /> : value}
      </p>
      {hint ? <p className="mt-0.5 text-caption text-ink-subtle">{hint}</p> : null}
    </>
  );
  const edge = clsx("min-w-0 border-t-2 pt-3 text-left", active ? "border-accent" : "border-line");
  return onClick ? (
    <button type="button" aria-pressed={active} onClick={onClick} className={clsx(edge, "rounded-b-control transition-colors hover:border-ink-faint", active && "hover:border-accent")}>
      {body}
    </button>
  ) : (
    <div className={edge}>{body}</div>
  );
}

/* ─── Details of a record ──────────────────────────────────────────────────────── */

/** Label/value pairs on a record page, in columns. No boxes — a quiet label over the value. */
export function Details({ children, columns = 3, className }: { children: ReactNode; columns?: 2 | 3 | 4; className?: string }) {
  return <dl className={clsx("grid gap-x-8 gap-y-4", columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-4" : "grid-cols-3", className)}>{children}</dl>;
}

export function Detail({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("min-w-0", className)}>
      <dt className="text-label text-ink-muted">{label}</dt>
      <dd className="selectable mt-0.5 text-body text-ink">{children}</dd>
    </div>
  );
}

/* ─── Table ────────────────────────────────────────────────────────────────────── */

/**
 * Tables: a 40px header (13px, sticky), 44px rows, hairline dividers, NO stripes, hover in light
 * grey, money right-aligned in tabular figures. A click (or Enter) opens the row; rarer actions
 * go in a <Menu> in the last cell.
 *
 *   <Table>
 *     <thead><tr><Th>Customer</Th><Th align="right">Amount</Th></tr></thead>
 *     <tbody>{rows.map(r => <Tr key={r.id} onOpen={() => open(r)}><Td>…</Td><Td align="right" num>…</Td></Tr>)}</tbody>
 *   </Table>
 *
 * Hand-rolled or virtualised rows can use the same look through `tableClass`.
 */
export const tableClass = {
  table: "w-full border-separate border-spacing-0 text-body text-ink",
  th: "sticky top-0 z-10 h-10 border-b border-line bg-surface px-3 text-label font-medium whitespace-nowrap text-ink-muted first:pl-0 last:pr-0",
  tr: "group/row",
  trOpen: "cursor-pointer hover:bg-surface-alt focus-visible:bg-surface-alt",
  trSelected: "bg-accent-50 shadow-[inset_2px_0_0_var(--color-accent)]",
  td: "h-11 border-b border-line-row px-3 py-1.5 align-middle first:pl-0 last:pr-0",
  right: "text-right",
  num: "num text-right whitespace-nowrap",
};

export function Table({ children, className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={clsx(tableClass.table, className)} {...rest}>
      {children}
    </table>
  );
}

export function Th({
  align,
  sort,
  onSort,
  className,
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
  /** This column's current sort, if it is the sorted one. */
  sort?: "asc" | "desc" | null;
  /** Makes the header clickable to sort. */
  onSort?: () => void;
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th scope="col" aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined} className={clsx(tableClass.th, alignClass, className)} {...rest}>
      {onSort ? (
        <button type="button" onClick={onSort} className={clsx("inline-flex items-center gap-1 rounded hover:text-ink", sort && "text-ink")}>
          {children}
          {sort === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : sort === "desc" ? <ArrowDown className="size-3.5" aria-hidden /> : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Tr({
  onOpen,
  selected,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & {
  /** Click or Enter opens the record. */
  onOpen?: () => void;
  selected?: boolean;
}) {
  return (
    <tr
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
            }
          : undefined
      }
      aria-selected={selected || undefined}
      className={clsx(tableClass.tr, onOpen && tableClass.trOpen, selected && tableClass.trSelected, className)}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function Td({
  align,
  num,
  muted,
  className,
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
  /** Money and quantities: right-aligned, tabular figures. */
  num?: boolean;
  muted?: boolean;
}) {
  return (
    <td className={clsx(tableClass.td, num ? tableClass.num : align === "right" ? "text-right" : align === "center" ? "text-center" : null, muted && "text-ink-muted", className)} {...rest}>
      {children}
    </td>
  );
}

/** Under a table: "8 of 14" on the left, Load more on the right. */
export function TableFooter({ shown, total, noun, onMore, loadingMore, children }: { shown: number; total?: number; noun?: string; onMore?: () => void; loadingMore?: boolean; children?: ReactNode }) {
  return (
    <div className="flex min-h-11 shrink-0 items-center gap-3 text-label text-ink-muted">
      <span className="num">
        {total !== undefined && total !== shown ? `${shown.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}` : shown.toLocaleString("en-IN")}
        {noun ? ` ${noun}` : ""}
      </span>
      {children}
      <span className="flex-1" />
      {onMore ? (
        <Button size="sm" onClick={onMore} loading={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}

/* ─── Filters ──────────────────────────────────────────────────────────────────── */

const pillClass = (active: boolean) =>
  clsx(
    "relative inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-label font-medium whitespace-nowrap transition-colors",
    active ? "border-accent/30 bg-accent-50 text-accent" : "border-line-strong bg-surface text-ink-muted hover:bg-surface-alt hover:text-ink",
  );

/**
 * A filter in the page toolbar, as a compact pill reading "Label: value" — never a row of open
 * fields. It is a real <select> underneath, so it works with the keyboard. `active` (a
 * non-default choice) tints it.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  active,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[value: string, label: string]>;
  /** Defaults to "the first option is the neutral one". */
  active?: boolean;
}) {
  const current = options.find(([v]) => v === value)?.[1] ?? value;
  const isActive = active ?? value !== options[0]?.[0];
  return (
    <span className={clsx(pillClass(isActive), "focus-within:ring-2 focus-within:ring-focus/40")}>
      <span className={isActive ? "text-accent/80" : "text-ink-subtle"}>{label}:</span>
      <span className={isActive ? undefined : "text-ink"}>{current}</span>
      <ChevronDown className="size-3.5 opacity-70" aria-hidden />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </span>
  );
}

/** An on/off filter pill ("Owing only"), or a pill that opens something of the screen's own. */
export function FilterPill({ active = false, onClick, children, icon }: { active?: boolean; onClick: () => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={clsx(pillClass(active), "[&_svg]:size-4")}>
      {icon}
      {children}
    </button>
  );
}

/* ─── Menu ("⋯") ───────────────────────────────────────────────────────────────── */

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  /** Shown in red. The action must still confirm in a dialog. */
  danger?: boolean;
  disabled?: boolean;
  /** Why it's disabled (tooltip). */
  hint?: string;
}

/**
 * The home of every rarer action: a "⋯" button that opens a small list. Destructive items are
 * red here and still ask before doing anything. ↑/↓ move, Enter picks, Esc closes.
 */
export function Menu({ items, label = "More actions", trigger, align = "right", size = "md" }: { items: Array<MenuItem | null | false | undefined>; label?: string; trigger?: ReactNode; align?: "left" | "right"; size?: ButtonSize }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = items.filter(Boolean) as MenuItem[];

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  if (list.length === 0) return null;

  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      {trigger ? (
        <Button size={size} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {trigger}
          <ChevronDown aria-hidden />
        </Button>
      ) : (
        <IconButton label={label} size={size} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <MoreHorizontal />
        </IconButton>
      )}
      {open ? (
        <div role="menu" onKeyDown={move} className={clsx("absolute top-full z-30 mt-1 min-w-44 rounded-control border border-line bg-surface p-1 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {list.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              autoFocus={item === list[0]}
              disabled={item.disabled}
              title={item.hint}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={clsx(
                "flex h-8 w-full items-center gap-2 rounded-[6px] px-2.5 text-left text-body whitespace-nowrap disabled:cursor-not-allowed disabled:text-ink-faint [&_svg]:size-4",
                item.danger ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft" : "text-ink hover:bg-surface-alt focus-visible:bg-surface-alt",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Dialog ───────────────────────────────────────────────────────────────────── */

/**
 * A centred dialog with the orange→red header band. Sizes: sm 384 · md 512 · lg 704.
 * Esc and the ✕ close it (not while `busy`). Put the buttons in `footer`, right-aligned, the
 * safe choice first: <Button variant="ghost">Cancel</Button> then the action. A destructive
 * confirm passes `danger` (a red icon in the band) and states the exact consequence in its body.
 */
export function Dialog({
  title,
  subtitle,
  onClose,
  busy = false,
  size = "sm",
  danger = false,
  footer,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: "sm" | "md" | "lg";
  danger?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  // Start inside the dialog (on whatever asked for focus, else the panel) so Tab and Esc work at once.
  useEffect(() => {
    const el = panel.current;
    if (el && !el.contains(document.activeElement)) el.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/35 p-6 pt-[10vh]">
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx("w-full overflow-hidden rounded-dialog bg-surface shadow-modal outline-none", size === "lg" ? "max-w-[704px]" : size === "md" ? "max-w-[512px]" : "max-w-[384px]")}
      >
        <div className="flex items-start gap-3 bg-linear-to-r from-band-from to-band-to py-3.5 pr-3 pl-5 text-white">
          {danger ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-title font-semibold">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-label text-white/85">{subtitle}</p> : null}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy} className="flex size-7 shrink-0 items-center justify-center rounded-control text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-40">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 px-5 pb-5">{footer}</div> : null}
      </div>
    </div>
  );
}

/** The dialog under its older name and props (`wide` = the 704px size). New code uses <Dialog>. */
export function Modal({ title, onClose, busy, children, wide }: { title: string; onClose: () => void; busy: boolean; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog title={title} onClose={onClose} busy={busy} size={wide ? "lg" : "sm"}>
      {children}
    </Dialog>
  );
}
