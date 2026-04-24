"use client";

import { useCallback, useReducer } from "react";
import { verifyGstNumber } from "@/lib/services/gstVerificationService";
import { saveFirmGstData } from "@/lib/services/firmService";
import type { GstVerifyState, GstVerifiedData } from "@/types/gst";

// ─── State machine ─────────────────────────────────────────────────────────────

type Action =
  | { type: "LOADING" }
  | { type: "SUCCESS"; payload: GstVerifiedData }
  | { type: "ERROR"; payload: string }
  | { type: "RESET" };

const initialState: GstVerifyState = {
  status: "idle",
  data: null,
  error: null,
};

function reducer(state: GstVerifyState, action: Action): GstVerifyState {
  switch (action.type) {
    case "LOADING":
      return { status: "loading", data: null, error: null };
    case "SUCCESS":
      return { status: "success", data: action.payload, error: null };
    case "ERROR":
      return { status: "error", data: null, error: action.payload };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export interface UseGstVerificationReturn {
  state: GstVerifyState;
  verify: (gstNumber: string) => Promise<GstVerifiedData | null>;
  reset: () => void;
}

export function useGstVerification(): UseGstVerificationReturn {
  const [state, dispatch] = useReducer(reducer, initialState);

  const verify = useCallback(
    async (gstNumber: string): Promise<GstVerifiedData | null> => {
      if (!gstNumber.trim()) return null;

      dispatch({ type: "LOADING" });
      try {
        const data = await verifyGstNumber(gstNumber);
        dispatch({ type: "SUCCESS", payload: data });
        // Persist to Firestore in the background — doesn't block the UI
        saveFirmGstData(data).catch((err) =>
          console.error("Failed to save GST data to Firestore:", err)
        );
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Verification failed.";
        dispatch({ type: "ERROR", payload: message });
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return { state, verify, reset };
}
