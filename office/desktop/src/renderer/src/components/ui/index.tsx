import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

/* ─── Button ───────────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-orange text-white hover:bg-brand-orange-dark active:bg-brand-orange-dark shadow-sm disabled:bg-brand-orange/50",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-hover active:bg-line disabled:text-ink-faint",
  ghost: "bg-transparent text-ink-muted hover:bg-hover hover:text-ink disabled:text-ink-faint",
  danger: "bg-danger text-white hover:bg-danger/90 shadow-sm disabled:bg-danger/50",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
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
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
        buttonStyles[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/* ─── Text input ───────────────────────────────────────────────────────────────── */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leading?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leading, className, ...rest },
  ref,
) {
  return (
    <div className={clsx("relative flex items-center", className)}>
      {leading ? <span className="pointer-events-none absolute left-2.5 text-ink-faint">{leading}</span> : null}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx(
          "h-8 w-full rounded-md border bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-faint transition-colors",
          "focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20",
          invalid ? "border-danger" : "border-line-strong hover:border-ink-faint",
          leading ? "pl-8" : null,
        )}
        {...rest}
      />
    </div>
  );
});

/* ─── Form field: label + control + error/help ─────────────────────────────────── */

export function Field({
  label,
  htmlFor,
  error,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : help ? (
        <p className="text-[12px] text-ink-muted">{help}</p>
      ) : null}
    </div>
  );
}

/* ─── Badge ─────────────────────────────────────────────────────────────────────── */

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const toneStyles: Record<Tone, string> = {
  neutral: "bg-hover text-ink-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  brand: "bg-brand-orange/10 text-brand-orange-dark",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-5 items-center gap-1 rounded px-1.5 text-2xs font-medium whitespace-nowrap",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ─── Small pieces ─────────────────────────────────────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("size-4 animate-spin text-ink-faint", className)} aria-label="Loading" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface px-1 font-sans text-2xs text-ink-muted">
      {children}
    </kbd>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("rounded-lg border border-line bg-surface", className)}>{children}</div>;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="mb-1 text-ink-faint">{icon}</div> : null}
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      {children ? <p className="max-w-md text-[13px] text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Platform-aware shortcut label: ⌘K on Mac, Ctrl K on Windows. */
export function modKey(): string {
  return window.office?.platform === "darwin" || navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
}
