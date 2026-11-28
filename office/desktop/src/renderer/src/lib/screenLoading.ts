import { useEffect, useSyncExternalStore } from "react";

/**
 * One loader per screen (Sharnya, 29 Nov 2026): every data hook reports while it's
 * fetching, and the app shell covers the screen with a single loader until all of them
 * are in — instead of a spinner in every tile. Later loads (a refresh in the background)
 * only show a thin bar at the top.
 */
let busy = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call in a data hook: `active` = it's fetching something the screen is waiting for. */
export function useLoadingSignal(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    busy += 1;
    emit();
    return () => {
      busy -= 1;
      emit();
    };
  }, [active]);
}

/** How many data hooks are fetching right now. */
export function useBusyCount(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => busy,
  );
}
