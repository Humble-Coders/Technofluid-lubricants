import type { OfficeBridge } from "../shared/ipc";

declare global {
  interface Window {
    /** Present inside the desktop app; undefined when the screens run in a plain browser. */
    office?: OfficeBridge;
  }
}

export {};
