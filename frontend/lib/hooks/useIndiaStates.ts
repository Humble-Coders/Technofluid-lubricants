import { useMemo } from "react";
import { State, City } from "country-state-city";

export type IndiaState = {
  name: string;
  isoCode: string;
};

export function useIndiaStates() {
  const states = useMemo<IndiaState[]>(
    () =>
      State.getStatesOfCountry("IN")
        .map((s) => ({ name: s.name, isoCode: s.isoCode }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const getCitiesForState = useMemo(
    () =>
      (isoCode: string): string[] =>
        City.getCitiesOfState("IN", isoCode)
          .map((c) => c.name)
          .sort((a, b) => a.localeCompare(b)),
    [],
  );

  return { states, getCitiesForState };
}
