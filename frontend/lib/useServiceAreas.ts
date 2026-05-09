// File: frontend/lib/useServiceAreas.ts
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/constants";

export function useServiceAreas() {
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);

  useEffect(() => {
    getDocs(collection(db, COLLECTIONS.DISTRIBUTORS))
      .then((snap) => {
        const seen = new Set<string>();
        snap.docs.forEach((d) => {
          const area = d.data().serviceArea;
          if (typeof area === "string" && area.trim()) seen.add(area.trim());
        });
        setServiceAreas(Array.from(seen).sort());
      })
      .catch(() => {});
  }, []);

  return serviceAreas;
}
