"use client";

import { useState } from "react";
import { ALL_STATES, getCitiesForStates } from "@/lib/data/territories";
import type { Territory } from "@/types/distributor";
import { CreateFormSection } from "./CreateFormSection";

type DistributorTerritorySectionProps = {
  value: Territory;
  onChange: (territory: Territory) => void;
  disabled?: boolean;
};

export function DistributorTerritorySection({
  value,
  onChange,
  disabled,
}: DistributorTerritorySectionProps) {
  const [stateSearch, setStateSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  const availableCities = getCitiesForStates(value.states);

  const filteredStates = stateSearch.trim()
    ? ALL_STATES.filter((s) =>
        s.toLowerCase().includes(stateSearch.trim().toLowerCase()),
      )
    : ALL_STATES;

  const filteredCities = citySearch.trim()
    ? availableCities.filter((c) =>
        c.toLowerCase().includes(citySearch.trim().toLowerCase()),
      )
    : availableCities;

  const toggleState = (state: string) => {
    const newStates = value.states.includes(state)
      ? value.states.filter((s) => s !== state)
      : [...value.states, state];

    const citiesForNewStates = getCitiesForStates(newStates);
    const newCities = value.cities.filter((c) =>
      citiesForNewStates.includes(c),
    );

    onChange({ ...value, states: newStates, cities: newCities });
    setStateSearch("");
  };

  const toggleCity = (city: string) => {
    const newCities = value.cities.includes(city)
      ? value.cities.filter((c) => c !== city)
      : [...value.cities, city];
    onChange({ ...value, cities: newCities });
    setCitySearch("");
  };

  const clearAll = () => {
    onChange({ states: [], districts: [], cities: [] });
    setStateSearch("");
    setCitySearch("");
  };

  const hasSelection = value.states.length > 0 || value.cities.length > 0;

  return (
    <CreateFormSection step={5} title="Distribution Territory">
      <div className="space-y-5">
        <p className="text-sm text-textSecondary">
          Select the geographic area this distributor will serve. Choose states
          first, then optionally narrow down to specific cities.
        </p>

        {/* Selected summary chips */}
        {hasSelection && (
          <div className="flex flex-wrap items-center gap-2">
            {value.states.map((s) => (
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
            {value.cities.map((c) => (
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
                onClick={clearAll}
                className="text-xs text-danger/70 hover:text-danger"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {/* States selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-textPrimary">
              States{" "}
              {value.states.length > 0 && (
                <span className="ml-1 text-xs font-normal text-textSecondary">
                  ({value.states.length} selected)
                </span>
              )}
            </label>
          </div>

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
                  const selected = value.states.includes(state);
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
                  <p className="px-2 py-1 text-xs text-textSecondary">
                    No states match your search.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cities selector — shown only after selecting states */}
        {value.states.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-textPrimary">
              Cities{" "}
              <span className="text-xs font-normal text-textSecondary">
                (optional — defaults to entire state)
              </span>
              {value.cities.length > 0 && (
                <span className="ml-1 text-xs font-normal text-textSecondary">
                  · {value.cities.length} selected
                </span>
              )}
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
                    const selected = value.cities.includes(city);
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
                    <p className="px-2 py-1 text-xs text-textSecondary">
                      No cities match your search.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!hasSelection && (
          <p className="text-xs text-textSecondary">
            Territory selection is optional but helps with conflict detection and
            reporting.
          </p>
        )}
      </div>
    </CreateFormSection>
  );
}
