"use client";

import { useEffect, useRef, useState } from "react";
import { checkTerritoryProductConflict } from "@/lib/services/distributorService";
import { DISTRIBUTOR_TYPE_CATEGORIES } from "@/lib/constants";
import { ALL_STATES, getCitiesForStates } from "@/lib/data/territories";
import type { AssignedProduct, DistributorType, Territory } from "@/types/distributor";
import type { Product } from "@/types/product";
import { CreateFormSection } from "./CreateFormSection";

type DistributorCoverageSectionProps = {
  distributorType: DistributorType | "";
  territory: Territory;
  onTerritoryChange: (t: Territory) => void;
  assignedProducts: AssignedProduct[];
  availableProducts: Product[];
  onProductsChange: (products: AssignedProduct[]) => void;
  onConflictChange: (conflicting: boolean) => void;
  errors: { territory?: string; assignedProducts?: string };
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
  const [stateSearch, setStateSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  const allowedCategories = distributorType
    ? DISTRIBUTOR_TYPE_CATEGORIES[distributorType] ?? null
    : null;

  const filteredProducts = distributorType
    ? allowedCategories === null
      ? availableProducts
      : availableProducts.filter((p) => p.category && allowedCategories.includes(p.category))
    : [];

  const availableCities = getCitiesForStates(territory.states);

  const filteredStates = stateSearch.trim()
    ? ALL_STATES.filter((s) => s.toLowerCase().includes(stateSearch.trim().toLowerCase()))
    : ALL_STATES;

  const filteredCities = citySearch.trim()
    ? availableCities.filter((c) => c.toLowerCase().includes(citySearch.trim().toLowerCase()))
    : availableCities;

  const toggleState = (state: string) => {
    const newStates = territory.states.includes(state)
      ? territory.states.filter((s) => s !== state)
      : [...territory.states, state];
    const citiesForNewStates = getCitiesForStates(newStates);
    const newCities = territory.cities.filter((c) => citiesForNewStates.includes(c));
    onTerritoryChange({ ...territory, states: newStates, cities: newCities });
    setStateSearch("");
  };

  const toggleCity = (city: string) => {
    const newCities = territory.cities.includes(city)
      ? territory.cities.filter((c) => c !== city)
      : [...territory.cities, city];
    onTerritoryChange({ ...territory, cities: newCities });
    setCitySearch("");
  };

  const clearTerritory = () => {
    onTerritoryChange({ states: [], districts: [], cities: [] });
    setStateSearch("");
    setCitySearch("");
  };

  const toggleProduct = (product: Product) => {
    const exists = assignedProducts.some((p) => p.productId === product.id);
    if (exists) {
      onProductsChange(assignedProducts.filter((p) => p.productId !== product.id));
    } else {
      onProductsChange([
        ...assignedProducts,
        { productId: product.id, productName: product.name, category: product.category ?? "" },
      ]);
    }
  };

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

  const hasTerritory = territory.states.length > 0 || territory.cities.length > 0;
  const showConflictSuccess =
    !conflictWarning && !isChecking && territory.states.length > 0 && assignedProducts.length > 0;

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
              Select the states this distributor will serve. Optionally narrow down to specific cities.
            </p>
          </div>

          {hasTerritory && (
            <div className="flex flex-wrap items-center gap-2">
              {territory.states.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                >
                  {s}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => toggleState(s)}
                      className="text-accent/70 hover:text-accent"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {territory.cities.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-textSecondary"
                >
                  {c}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => toggleCity(c)}
                      className="hover:text-textPrimary"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {!disabled && (
                <button
                  type="button"
                  onClick={clearTerritory}
                  className="text-xs text-danger/70 hover:text-danger"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-textSecondary">
              States{territory.states.length > 0 && ` · ${territory.states.length} selected`}
            </label>
            <input
              type="text"
              placeholder="Search states..."
              value={stateSearch}
              onChange={(e) => setStateSearch(e.target.value)}
              disabled={disabled}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-textPrimary placeholder:text-textSecondary/70 outline-none focus:border-accent focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {stateSearch.trim() && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-page p-2">
                <div className="flex flex-wrap gap-1.5">
                  {filteredStates.map((state) => {
                    const selected = territory.states.includes(state);
                    return (
                      <button
                        key={state}
                        type="button"
                        onClick={() => !disabled && toggleState(state)}
                        disabled={disabled}
                        className={`rounded-lg px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed ${
                          selected
                            ? "bg-accent text-accentContrast font-medium"
                            : "bg-surface border border-border text-textSecondary hover:border-accent/50 hover:text-textPrimary"
                        }`}
                      >
                        {state}
                      </button>
                    );
                  })}
                  {filteredStates.length === 0 && (
                    <p className="px-2 py-1 text-xs text-textSecondary">No states match your search.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {territory.states.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-textSecondary">
                Cities{" "}
                <span className="font-normal">(optional — defaults to entire state)</span>
                {territory.cities.length > 0 && ` · ${territory.cities.length} selected`}
              </label>
              <input
                type="text"
                placeholder="Search cities..."
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                disabled={disabled}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-textPrimary placeholder:text-textSecondary/70 outline-none focus:border-accent focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
              {citySearch.trim() && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-page p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {filteredCities.map((city) => {
                      const selected = territory.cities.includes(city);
                      return (
                        <button
                          key={city}
                          type="button"
                          onClick={() => !disabled && toggleCity(city)}
                          disabled={disabled}
                          className={`rounded-lg px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed ${
                            selected
                              ? "bg-accent text-accentContrast font-medium"
                              : "bg-surface border border-border text-textSecondary hover:border-accent/50 hover:text-textPrimary"
                          }`}
                        >
                          {city}
                        </button>
                      );
                    })}
                    {filteredCities.length === 0 && (
                      <p className="px-2 py-1 text-xs text-textSecondary">No cities match your search.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {errors.territory && (
            <p className="text-sm text-danger">{errors.territory}</p>
          )}
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
                      onChange={() => !disabled && toggleProduct(product)}
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
          <p className="text-xs text-textSecondary animate-pulse">Checking for conflicts...</p>
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
