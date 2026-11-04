import { useEffect, useState } from "react";
import { watchRecipeRequests, type RecipeRequest, type RequestFilter } from "@/services/recipeService";
import type { LoadState } from "./useProducts";

/** Live recipe-change requests. Pass null to skip (roles that can't read them). */
export function useRecipeRequests(filter: RequestFilter | null): LoadState<RecipeRequest[]> {
  const [state, setState] = useState<LoadState<RecipeRequest[]>>({ status: "loading" });
  const key = filter ? JSON.stringify(filter) : null;
  useEffect(() => {
    if (!key) return;
    setState({ status: "loading" });
    return watchRecipeRequests(
      JSON.parse(key) as RequestFilter,
      (data) => setState({ status: "ready", data }),
      (err) => setState({ status: "error", message: err.message }),
    );
  }, [key]);
  return state;
}
