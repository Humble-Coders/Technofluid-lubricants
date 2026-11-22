import clsx from "clsx";
import { Clock, Pencil } from "lucide-react";
import { useState } from "react";
import { parseAlternates, parseRecipe } from "@technofluid/core";
import { Banner, Button, Section, Segmented } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { RecipeChangeDialog } from "@/features/recipes/RecipeChangeDialog";
import { useRecipeRequests } from "@/hooks/useRecipeRequests";
import { canChangeRecipe } from "@/lib/access";
import { saveStockItem, type StockItem, type StockMode } from "@/services/stockService";

const MODE_HELP: Record<StockMode, string> = {
  breakDown: "Making a product uses the raw materials in this recipe directly.",
  stocked: "Made in advance and kept in stock — making a product takes it from stock.",
};

/**
 * A premix's or blend's own recipe in its Live stock panel (Sharnya, 23 Oct 2026):
 * the recipe with any alternates, "Change recipe" (same approval as products), and
 * the Admin's switch between "Mixed on the spot" and "Kept in stock".
 */
export function MixRecipeSection({ item }: { item: StockItem }) {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requests = useRecipeRequests(canChangeRecipe(role) ? { itemId: item.id } : null);
  const waiting = requests.status === "ready" ? requests.data.find((r) => r.status === "pending") : undefined;
  const recipe = parseRecipe(item.recipe);
  const alternates = parseAlternates(item.recipeAlternates);
  const mode = item.stockMode ?? "breakDown";

  const setMode = async (next: StockMode) => {
    if (next === mode) return;
    setBusy(true);
    setError(null);
    try {
      await saveStockItem({
        itemId: item.id,
        name: item.name,
        code: item.code,
        baseUnit: item.unitSet ? item.baseUnit : null,
        densityKgPerL: item.densityKgPerL,
        aliases: item.aliases,
        stockMode: next,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section title="When a product uses it">
        {isAdmin ? (
          <div className={clsx(busy && "pointer-events-none opacity-60")}>
            <Segmented
              value={mode}
              onChange={(m) => void setMode(m)}
              options={[
                ["breakDown", "Mixed on the spot"],
                ["stocked", "Kept in stock"],
              ]}
            />
          </div>
        ) : (
          <p className="text-body font-medium text-ink">{mode === "stocked" ? "Kept in stock" : "Mixed on the spot"}</p>
        )}
        <p className="mt-2 text-label text-ink-muted">
          {MODE_HELP[mode]}
          {isAdmin ? "" : " Only an Admin changes this."}
        </p>
        {error ? (
          <Banner tone="danger" className="mt-2">
            {error}
          </Banner>
        ) : null}
      </Section>

      <Section
        title="Recipe"
        action={
          canChangeRecipe(role) ? (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)} icon={<Pencil />}>
              Change recipe
            </Button>
          ) : null
        }
      >
        {recipe.length === 0 ? (
          <p className="text-label text-ink-muted">No recipe yet.</p>
        ) : (
          <ul className="border-t border-line-row">
            {recipe.map((r) => (
              <li key={r.code} className="border-b border-line-row py-2 text-label">
                <div className="flex items-center justify-between gap-3 text-ink">
                  <span className="font-mono">{r.code}</span>
                  <span className="num">{r.percentBp === null ? "no %" : `${r.percentBp / 100}%`}</span>
                </div>
                {alternates
                  .filter((a) => a.main === r.code)
                  .map((a) => (
                    <div key={a.ingredient.code} className="mt-0.5 flex items-center justify-between gap-3 pl-4 text-ink-muted">
                      <span>
                        or <span className="font-mono">{a.ingredient.code}</span>
                      </span>
                      <span className="num">{a.ingredient.percentBp === null ? "no %" : `${a.ingredient.percentBp / 100}%`}</span>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        )}
        {waiting ? (
          <p className="mt-3 flex items-center gap-1.5 text-label text-warning">
            <Clock className="size-4 shrink-0" /> A change asked by {waiting.requestedBy} is waiting for approval.
          </p>
        ) : null}
      </Section>

      {open ? (
        <RecipeChangeDialog
          target={{ itemId: item.id }}
          productName={item.name}
          currentRecipe={item.recipe}
          currentAlternates={item.recipeAlternates}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
