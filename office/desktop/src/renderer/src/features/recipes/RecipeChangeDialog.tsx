import clsx from "clsx";
import { AlertTriangle, Clock, Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { parseRecipe } from "@technofluid/core";
import { Button, Input } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { useRecipeRequests } from "@/hooks/useRecipeRequests";
import { useStockItems } from "@/hooks/useStock";
import { requestRecipeChange, type RecipeLineInput } from "@/services/recipeService";

interface Row {
  key: number;
  code: string;
  percent: string;
}

let nextKey = 1;
const rowsFrom = (recipe: string[]): Row[] =>
  parseRecipe(recipe).map((i) => ({
    key: nextKey++,
    code: i.code,
    percent: i.percentBp === null ? "" : String(i.percentBp / 100),
  }));

/**
 * Ask for a product's recipe to change. Stock & Production's change waits for an Admin
 * (they're notified under Approvals); an Admin's own change applies at once. Either way
 * it covers every pack size of the product + grade.
 */
export function RecipeChangeDialog({
  productKey,
  productName,
  currentRecipe,
  onClose,
  onSent,
}: {
  productKey: string;
  productName: string;
  currentRecipe: string[];
  /** Called with the new recipe when it was applied straight away (Admin), else null. */
  onClose: (applied: string[] | null) => void;
  /** Called when the change was sent to an Admin for approval. */
  onSent?: () => void;
}) {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const listId = useId();
  const [rows, setRows] = useState<Row[]>(() => (currentRecipe.length ? rowsFrom(currentRecipe) : [{ key: nextKey++, code: "", percent: "" }]));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const items = useStockItems();
  const requests = useRecipeRequests({ productKey });
  const waiting = requests.status === "ready" ? requests.data.find((r) => r.status === "pending") : undefined;
  const codes = useMemo(
    () => (items.status === "ready" ? items.data.filter((i) => i.kind !== "product_pool" && i.code) : []),
    [items],
  );

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  const total = rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);
  const update = (key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setError(null);
  };

  const submit = async () => {
    setError(null);
    const filled = rows.filter((r) => r.code.trim() || r.percent.trim());
    if (filled.length === 0) return setError("Add at least one ingredient.");
    const recipe: RecipeLineInput[] = [];
    for (const r of filled) {
      if (!r.code.trim()) return setError("Every line needs an ingredient code.");
      const p = r.percent.trim() ? Number(r.percent) : null;
      if (p !== null && (!Number.isFinite(p) || p <= 0 || p > 100)) {
        return setError(`${r.code}: the percent must be above 0 and at most 100, or empty.`);
      }
      recipe.push({ code: r.code.trim(), percent: p });
    }
    if (!isAdmin && !reason.trim()) return setError("Say why the recipe should change.");
    setBusy(true);
    try {
      const result = await requestRecipeChange(productKey, recipe, reason);
      if (result.status === "approved") {
        onClose(recipe.map((r) => `${r.code.toLowerCase()}/${r.percent ?? ""}`));
      } else {
        setSent(true);
        setBusy(false);
        onSent?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Change recipe of ${productName}`}
    >
      <div className="w-full max-w-xl rounded-lg border border-line bg-surface shadow-pop">
        <div className="flex items-start gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Change recipe</p>
            <p className="text-[12px] text-ink-muted">{productName} — all pack sizes</p>
          </div>
          <Button variant="ghost" size="sm" className="px-1.5" aria-label="Close" onClick={() => onClose(null)} disabled={busy}>
            <X className="size-4" />
          </Button>
        </div>

        {sent ? (
          <div className="space-y-3 px-4 py-5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
              <Clock className="size-4 text-brand-orange" /> Sent to the Admin for approval.
            </p>
            <p className="text-[12px] text-ink-muted">
              Production keeps using the current recipe until it's approved. You'll see the result on the product.
            </p>
            <div className="flex justify-end">
              <Button size="sm" variant="primary" onClick={() => onClose(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3 px-4 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {waiting ? (
              <p className="flex items-start gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
                <Clock className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {waiting.requestedBy} already asked for a change ({waiting.proposedRecipe.join(", ")}) — waiting for approval.
                  {isAdmin ? " Saving yours replaces it." : " A new one can be sent once it's decided."}
                </span>
              </p>
            ) : null}

            <datalist id={listId}>
              {codes.map((i) => (
                <option key={i.id} value={i.code ?? ""}>
                  {i.name}
                </option>
              ))}
            </datalist>

            <div className="grid grid-cols-[1fr_110px_32px] gap-2 text-2xs font-medium tracking-wide text-ink-muted uppercase">
              <span>Ingredient (recipe code)</span>
              <span className="text-center">Percent</span>
              <span />
            </div>
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[1fr_110px_32px] items-center gap-2">
                <Input
                  aria-label="Ingredient code"
                  value={r.code}
                  onChange={(e) => update(r.key, { code: e.target.value })}
                  list={listId}
                  placeholder="e.g. w150"
                  className="font-mono"
                />
                <div className="relative">
                  <Input
                    aria-label="Percent"
                    value={r.percent}
                    onChange={(e) => update(r.key, { percent: e.target.value })}
                    inputMode="decimal"
                    placeholder="no %"
                    className="num [&_input]:pr-7"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-ink-muted">%</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-1.5"
                  aria-label="Remove ingredient"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  disabled={rows.length === 1}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setRows((rs) => [...rs, { key: nextKey++, code: "", percent: "" }])}>
                Add ingredient
              </Button>
              <div className="flex-1" />
              <span className={clsx("num text-[12px]", Math.abs(total - 100) < 0.005 ? "text-success" : "text-warning")}>
                Total: {Math.round(total * 100) / 100}%
              </span>
            </div>
            {Math.abs(total - 100) >= 0.005 ? (
              <p className="flex items-center gap-1.5 text-[12px] text-warning">
                <AlertTriangle className="size-3.5" /> The percents don't add up to 100% — that's allowed, but check it.
              </p>
            ) : null}
            <p className="text-[12px] text-ink-faint">Leave the percent empty for an ingredient without one (asked about at production time).</p>

            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-ink">Why change it?{isAdmin ? " (optional)" : ""}</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                rows={2}
                className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 focus:outline-none"
                placeholder="e.g. More W150 gives better flow in winter"
              />
            </label>

            {error ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => onClose(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                type="submit"
                loading={busy}
                disabled={!isAdmin && Boolean(waiting)}
              >
                {isAdmin ? "Save recipe" : "Send for approval"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
