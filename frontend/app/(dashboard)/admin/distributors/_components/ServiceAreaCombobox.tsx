"use client";

import { useEffect, useRef, useState } from "react";

type ServiceAreaComboboxProps = {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
};

export function ServiceAreaCombobox({
  value,
  options,
  onChange,
  error,
  disabled,
}: ServiceAreaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const trimmed = query.trim();
  const filtered = options.filter((o) =>
    o.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const showAddOption =
    trimmed.length > 0 &&
    !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  const select = (v: string) => {
    setQuery(v);
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <label
        htmlFor="dist-service-area"
        className="block text-sm font-medium text-textPrimary"
      >
        Service Area <span className="text-danger">*</span>
      </label>

      <div className="relative">
        <input
          id="dist-service-area"
          type="text"
          autoComplete="off"
          value={query}
          disabled={disabled}
          placeholder="e.g. Mumbai, Delhi NCR"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          className={`w-full rounded-xl border bg-surface px-4 py-2.5 text-sm text-textPrimary shadow-sm outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${
            error
              ? "border-danger focus:border-danger focus:ring-danger/20"
              : "border-border focus:border-accent focus:ring-accent/20"
          }`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-textSecondary">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {open && !disabled && (filtered.length > 0 || showAddOption) && (
        <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
          {filtered.map((option) => (
            <li
              key={option}
              onMouseDown={() => select(option)}
              className={`cursor-pointer px-4 py-2.5 text-sm transition-colors hover:bg-accent/10 ${
                value === option
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-textPrimary"
              }`}
            >
              {option}
            </li>
          ))}
          {showAddOption && (
            <li
              onMouseDown={() => select(trimmed)}
              className="cursor-pointer border-t border-border px-4 py-2.5 text-sm text-accent transition-colors hover:bg-accent/10"
            >
              + Add &ldquo;{trimmed}&rdquo;
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
