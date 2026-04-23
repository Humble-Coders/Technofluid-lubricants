// File: frontend/components/ui/input.tsx
import type { InputHTMLAttributes } from "react";

type InputProps = {
  id: string;
  label: string;
  error?: string;
  helperText?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function Input({
  id,
  label,
  error,
  helperText,
  className = "",
  ...props
}: InputProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-textPrimary"
      >
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-textPrimary shadow-sm outline-none transition placeholder:text-textSecondary/70 focus:border-accent focus:ring-4 focus:ring-accent/20 disabled:bg-textSecondary/10 disabled:text-textSecondary/60 disabled:cursor-not-allowed ${className}`}
        {...props}
      />
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p className="text-xs text-textSecondary">{helperText}</p>
      ) : null}
    </div>
  );
}
