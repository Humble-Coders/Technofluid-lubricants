"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { checkTerritoryProductConflict } from "@/lib/services/distributorService";
import { DISTRIBUTOR_TYPE_CATEGORIES } from "@/lib/constants";
import { useIndiaStates } from "@/lib/hooks/useIndiaStates";
import type { AssignedProduct, DistributorType, Territory } from "@/types/distributor";
import type { Product } from "@/types/product";
import { CreateFormSection } from "./CreateFormSection";

type ComboSelectProps = {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
};

function ComboSelect({ options, value, onChange, placeholder, disabled }: ComboSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const filtered = useMemo(
    () =>
      search.trim()
        ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        : options,
    [options, search],
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex w-full items-center rounded-xl border bg-surface px-3 py-2.5 text-sm transition-colors ${
          disabled
            ? "cursor-not-allowed border-border opacity-60"
            : "border-border hover:border-accent/50"
        }`}
      >
        <button
          type="button"
          className={`flex-1 text-left ${selectedLabel ? "text-textPrimary" : "text-textSecondary/70"}`}
          onClick={() => { if (!disabled) setOpen((o) => !o); }}
          disabled={disabled}
        >
          {selectedLabel || placeholder}
        </button>
        {value && !disabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); close(); }}
            className="ml-1.5 text-lg leading-none text-textSecondary/60 hover:text-textPrimary"
            aria-label="Clear"
          >
            ×
          </button>
        )}
        <button
          type="button"
          onClick={() => { if (!disabled) setOpen((o) => !o); }}
          disabled={disabled}
          className="ml-1.5 text-textSecondary"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-page shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-textPrimary placeholder:text-textSecondary/70 outline-none focus:border-accent"
              onKeyDown={(e) => e.key === "Escape" && close()}
            />
          </div>
          <div className="max-h-52 overflow-y-auto px-2 pb-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-textSecondary">No results.</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); close(); }}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                    opt.value === value
                      ? "bg-accent font-medium text-accentContrast"
                      : "text-textPrimary hover:bg-surface"
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type MultiComboSelectProps = {
  options: { value: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  disabled?: boolean;
};

function MultiComboSelect({ options, values, onChange, placeholder, disabled }: MultiComboSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      search.trim()
        ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        : options,
    [options, search],
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const toggle = (val: string) => {
    onChange(values.includes(val) ? values.filter((v) => v !== val) : [...values, val]);
  };

  const triggerLabel =
    values.length === 0
      ? placeholder
      : `${values.length} ${values.length === 1 ? "city" : "cities"} selected`;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex w-full items-center rounded-xl border bg-surface px-3 py-2.5 text-sm transition-colors ${
          disabled
            ? "cursor-not-allowed border-border opacity-60"
            : "border-border hover:border-accent/50"
        }`}
      >
        <button
          type="button"
          className={`flex-1 text-left ${values.length > 0 ? "text-textPrimary" : "text-textSecondary/70"}`}
          onClick={() => { if (!disabled) setOpen((o) => !o); }}
          disabled={disabled}
        >
          {triggerLabel}
        </button>
        {values.length > 0 && !disabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="ml-1.5 text-lg leading-none text-textSecondary/60 hover:text-textPrimary"
            aria-label="Clear all"
          >
            ×
          </button>
        )}
        <button
          type="button"
          onClick={() => { if (!disabled) setOpen((o) => !o); }}
          disabled={disabled}
          className="ml-1.5 text-textSecondary"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-page shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cities..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-textPrimary placeholder:text-textSecondary/70 outline-none focus:border-accent"
              onKeyDown={(e) => e.key === "Escape" && (setOpen(false), setSearch(""))}
            />
          </div>
          <div className="max-h-52 overflow-y-auto px-2 pb-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-textSecondary">No results.</p>
            ) : (
              filtered.map((opt) => {
                const selected = values.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                      selected ? "bg-accent/10 font-medium text-accent" : "text-textPrimary hover:bg-surface"
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-accent bg-accent" : "border-border"}`}>
                      {selected && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 text-accentContrast" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      )}
                    </span>
                    {opt.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type DistributorCoverageSectionProps = {
  distributorType: DistributorType | "";
  territory: Territory;
  onTerritoryChange: (t: Territory) => void;
  assignedProducts: AssignedProduct[];
  availableProducts: Product[];
  onProductsChange: (products: AssignedProduct[]) => void;
  onConflictChange: (conflicting: boolean) => void;
  errors: { territory?: string; city?: string; assignedProducts?: string };
  disabled?: boolean;
};

export function DistributorCoverageSection({
  distributorType,
  territory,
  onTerritoryChange,
  assignedProducts,
  availableProducts,
  onProductsChange,
  onConflictChange,
  errors,
  disabled,
}: DistributorCoverageSectionProps) {
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { states, getCitiesForState } = useIndiaStates();

  const selectedStateName = territory.states[0] ?? "";

  const selectedStateIso = useMemo(
    () => states.find((s) => s.name === selectedStateName)?.isoCode ?? "",
    [states, selectedStateName],
  );

  const cities = useMemo(
    () => (selectedStateIso ? getCitiesForState(selectedStateIso) : []),
    [selectedStateIso, getCitiesForState],
  );

  const stateOptions = useMemo(
    () => states.map((s) => ({ value: s.name, label: s.name })),
    [states],
  );

  const cityOptions = useMemo(
    () => cities.map((c) => ({ value: c, label: c })),
    [cities],
  );

  const handleStateChange = (stateName: string) => {
    onTerritoryChange({ states: stateName ? [stateName] : [], districts: [], cities: [] });
  };

  const handleCityChange = (cityNames: string[]) => {
    onTerritoryChange({ ...territory, cities: cityNames });
  };

  const allowedCategories = distributorType
    ? DISTRIBUTOR_TYPE_CATEGORIES[distributorType] ?? null
    : null;

  const filteredProducts = distributorType
    ? allowedCategories === null
      ? availableProducts
      : availableProducts.filter((p) => p.category && allowedCategories.includes(p.category))
    : [];

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!territory.states.length || !assignedProducts.length) {
      setConflictWarning(null);
      onConflictChange(false);
      return;
    }

    setIsChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const productIds = assignedProducts.map((p) => p.productId);
        const result = await checkTerritoryProductConflict(territory, productIds);
        if (result.conflicting) {
          const msg = result.distributorName
            ? `"${result.distributorName}" already covers this territory for one or more of these products.`
            : "Another distributor already covers this territory for one or more of these products.";
          setConflictWarning(msg);
          onConflictChange(true);
        } else {
          setConflictWarning(null);
          onConflictChange(false);
        }
      } catch {
        setConflictWarning(null);
        onConflictChange(false);
      } finally {
        setIsChecking(false);
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territory.states, territory.cities, assignedProducts]);

  const showConflictSuccess =
    !conflictWarning &&
    !isChecking &&
    territory.states.length > 0 &&
    assignedProducts.length > 0;

  return (
    <CreateFormSection step={4} title="Distribution Coverage">
      <div className="space-y-6">
        {/* ── Geographic Territory ── */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-textPrimary">
              Geographic Territory <span className="text-danger">*</span>
            </p>
            <p className="mt-0.5 text-xs text-textSecondary">
              Select the state and city this distributor will serve.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-textSecondary">
                State <span className="text-danger">*</span>
              </label>
              <ComboSelect
                options={stateOptions}
                value={selectedStateName}
                onChange={handleStateChange}
                placeholder="Select State"
                disabled={disabled}
              />
              {errors.territory && (
                <p className="text-sm text-danger">{errors.territory}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-textSecondary">
                City <span className="text-danger">*</span>
              </label>
              <MultiComboSelect
                options={cityOptions}
                values={territory.cities}
                onChange={handleCityChange}
                placeholder="Select City"
                disabled={disabled || !selectedStateName}
              />
              {territory.cities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {territory.cities.map((city) => (
                    <span
                      key={city}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-textSecondary"
                    >
                      {city}
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => handleCityChange(territory.cities.filter((c) => c !== city))}
                          className="ml-0.5 text-textSecondary/60 hover:text-danger"
                          aria-label={`Remove ${city}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {errors.city && (
                <p className="text-sm text-danger">{errors.city}</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* ── Assigned Products ── */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-textPrimary">
              Assigned Products <span className="text-danger">*</span>
            </p>
            <p className="mt-0.5 text-xs text-textSecondary">
              {distributorType
                ? "Select the products this distributor is authorized to sell."
                : "Select a distributor type first to see available products."}
            </p>
          </div>

          {!distributorType && (
            <div className="rounded-xl border border-border bg-page px-4 py-6 text-center">
              <p className="text-sm text-textSecondary">
                Select a distributor type in Step 3 to see available products.
              </p>
            </div>
          )}

          {distributorType && filteredProducts.length === 0 && (
            <p className="text-sm text-textSecondary">
              No products found for this distributor type. Add products first.
            </p>
          )}

          {distributorType && filteredProducts.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => {
                const isSelected = assignedProducts.some((p) => p.productId === product.id);
                return (
                  <label
                    key={product.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                      isSelected
                        ? "border-accent bg-accent/10"
                        : "border-border bg-page hover:border-accent/50"
                    } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => !disabled && (
                        isSelected
                          ? onProductsChange(assignedProducts.filter((p) => p.productId !== product.id))
                          : onProductsChange([...assignedProducts, { productId: product.id, productName: product.name, category: product.category ?? "" }])
                      )}
                      disabled={disabled}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[color:var(--color-accent)]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-textPrimary">{product.name}</p>
                      {product.category && (
                        <p className="text-xs text-textSecondary">{product.category}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {errors.assignedProducts && (
            <p className="text-sm text-danger">{errors.assignedProducts}</p>
          )}
        </div>

        {/* ── Conflict feedback ── */}
        {isChecking && (
          <p className="animate-pulse text-xs text-textSecondary">Checking for conflicts...</p>
        )}

        {conflictWarning && !isChecking && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 h-4 w-4 shrink-0 text-danger"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-sm text-danger">{conflictWarning}</p>
          </div>
        )}

        {showConflictSuccess && (
          <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-success"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-sm text-success">No conflicts — this coverage is available.</p>
          </div>
        )}
      </div>
    </CreateFormSection>
  );
}
