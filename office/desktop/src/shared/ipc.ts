/** Types shared by the main process, the preload bridge and the screens. */

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  isPackaged: boolean;
}

/** Everything the screens can ask the computer for. Keep this list short on purpose. */
export interface OfficeBridge {
  platform: string;
  getAppInfo(): Promise<AppInfo>;
}
