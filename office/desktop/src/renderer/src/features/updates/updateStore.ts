import { useSyncExternalStore } from "react";
import type { UpdateEvent } from "../../../../shared/ipc";

/**
 * The in-app update's state, shared by the pop-up (UpdatePrompt) and the sidebar's
 * "Update" button. main/updater.ts sends the news; this keeps the latest of it.
 * `hidden` = the person chose "Later" (or closed it); the sidebar then offers it again.
 */
export type UpdateState =
  | { kind: "none" }
  | { kind: "available"; version: string; notes: string | null }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

type Store = { update: UpdateState; hidden: boolean };

let store: Store = { update: { kind: "none" }, hidden: false };
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

function onEvent(e: UpdateEvent) {
  const s = store.update;
  if (e.kind === "available") {
    if (s.kind === "none") set({ update: { kind: "available", version: e.version, notes: e.notes } });
  } else if (e.kind === "progress") {
    set({ update: { kind: "downloading", version: s.kind === "available" || s.kind === "downloading" ? s.version : "", percent: e.percent } });
  } else if (e.kind === "downloaded") {
    // A finished download is always worth showing, even after "Later".
    set({ update: { kind: "downloaded", version: e.version }, hidden: false });
  } else {
    set({ update: { kind: "error", message: e.message }, hidden: false });
  }
}

/** Starts listening to the main process once (called by UpdatePrompt, mounted once). */
export function startUpdateListener(): () => void {
  if (started || !window.office?.onUpdate) return () => undefined;
  started = true;
  const stop = window.office.onUpdate(onEvent);
  return () => {
    started = false;
    stop?.();
  };
}

export const updateActions = {
  hide: () => set({ hidden: true }),
  show: () => set({ hidden: false }),
  download: () => {
    const s = store.update;
    if (s.kind !== "available" && s.kind !== "error") return;
    set({ update: { kind: "downloading", version: s.kind === "available" ? s.version : "", percent: 0 }, hidden: false });
    void window.office?.update("download");
  },
  install: () => void window.office?.update("install"),
  openPage: () => void window.office?.update("openPage"),
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useUpdate(): Store {
  return useSyncExternalStore(subscribe, () => store);
}
