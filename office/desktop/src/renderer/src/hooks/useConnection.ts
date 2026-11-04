import { useEffect, useState } from "react";

/**
 * Online/offline as the computer reports it. Firestore keeps working offline (cached
 * reads, queued writes) — this only drives the status pill so people know their
 * changes are waiting to sync rather than lost.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}
