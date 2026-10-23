import { Clock, FlaskConical, Pencil } from "lucide-react";
import { useState } from "react";
import { parseAlternates } from "@technofluid/core";
import { Badge, Button } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { RecipeChangeDialog } from "@/features/recipes/RecipeChangeDialog";
import { useRecipeRequests } from "@/hooks/useRecipeRequests";
import { useStockItems } from "@/hooks/useStock";
import { materialFinder } from "@/features/stock/reviewModel";
import { isMix } from "@/services/stockService";
import { canChangeRecipe } from "@/lib/access";
import type { Product } from "@/services/productService";

/**
 * A product's recipe in its side panel, with "Change recipe" for Admin and Stock &
 * Production and the latest change request's status (waiting / approved / rejected).
 */
export function RecipeSection({ product: p }: { product: Product }) {
  const { role } = useStaff();
  const allowed = canChangeRecipe(role);
  const [open, setOpen] = useState(false);
  const requests = useRecipeRequests(allowed && p.productKey ? { productKey: p.productKey } : null);
  const latest = requests.status === "ready" ? requests.data[0] : undefined;
  const alternates = parseAlternates(p.recipeAlternates ?? []);
  const stock = useStockItems();
  const find = materialFinder(stock.status === "ready" ? stock.data : []);

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-2xs font-medium tracking-wide text-ink-muted uppercase">
        <FlaskConical className="size-3.5" /> Recipe
        <span className="flex-1" />
        {allowed ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)} icon={<Pencil className="size-3" />} className="normal-case tracking-normal">
            Change recipe
          </Button>
        ) : null}
      </h3>
      {p.recipe.length === 0 ? (
        <p className="text-[12px] text-ink-muted">No recipe recorded.</p>
      ) : (
        <ul className="space-y-1">
          {p.recipe.map((item, i) => {
            const [name, pct] = item.split("/");
            const code = name?.trim().toLowerCase() ?? "";
            const alts = alternates.filter((a) => a.main === code);
            return (
              <li key={i} className="rounded bg-canvas px-2.5 py-1.5 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">{name?.trim()}</span>
                  {(() => {
                    const m = find(code);
                    return m && isMix(m.kind) ? (
                      <Badge tone="warning" className="mr-auto">
                        {m.kind === "premix" ? "Premix" : "Blend"} · {m.stockMode === "stocked" ? "kept in stock" : "mixed on the spot"}
                      </Badge>
                    ) : null;
                  })()}
                  <span className="num text-ink-muted">{pct?.trim() ? `${pct.trim()}%` : "no %"}</span>
                </div>
                {alts.map((a) => (
                  <div key={a.ingredient.code} className="flex items-center justify-between pl-3 text-ink-muted">
                    <span>
                      or <span className="font-mono">{a.ingredient.code}</span>
                    </span>
                    <span className="num">{a.ingredient.percentBp === null ? "no %" : `${a.ingredient.percentBp / 100}%`}</span>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {latest ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
          {latest.status === "pending" ? <Clock className="size-3.5 text-warning" /> : null}
          <Badge tone={latest.status === "pending" ? "warning" : latest.status === "approved" ? "success" : latest.status === "rejected" ? "danger" : "neutral"}>
            {latest.status === "pending" ? "Change waiting for approval" : latest.status === "approved" ? "Last change approved" : latest.status === "rejected" ? "Last change rejected" : "Last change replaced"}
          </Badge>
          <span>
            asked by {latest.requestedBy}
            {latest.status === "rejected" && latest.decisionNote ? ` — “${latest.decisionNote}”` : ""}
          </span>
        </p>
      ) : null}
      {open ? (
        <RecipeChangeDialog
          target={{ productKey: p.productKey }}
          productName={[p.name, p.grade].filter(Boolean).join(" ")}
          currentRecipe={p.recipe}
          currentAlternates={p.recipeAlternates}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}
