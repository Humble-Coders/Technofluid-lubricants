import clsx from "clsx";
import { AlertTriangle, Clock, Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { parseAlternates, parseRecipe } from "@technofluid/core";
import { Button, Input, Select } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { useRecipeRequests } from "@/hooks/useRecipeRequests";
import { useStockItems } from "@/hooks/useStock";
import { requestRecipeChange, type AlternateInput, type RecipeLineInput } from "@/services/recipeService";

interface Row {
  key: number;
  code: string;
  percent: string;
}

interface AltRow {
  key: number;
  main: string;
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

const altRowsFrom = (alternates: string[]): AltRow[] =>
  parseAlternates(alternates).map((a) => ({
    key: nextKey++,
    main: a.main,
    code: a.ingredient.code,
    percent: a.ingredient.percentBp === null ? "" : String(a.ingredient.percentBp / 100),
  }));

/**
 * Ask for a product's recipe to change. Stock & Production's change waits for an Admin
 * (they're notified under Approvals); an Admin's own change applies at once. Either way
 * it covers every pack size of the product + grade. The percents must total 100%.
 * Only an Admin sets alternate materials (each with its own %).
 */
export function RecipeChangeDialog({
  productKey,
  productName,
  currentRecipe,
  currentAlternates = [],
  onClose,
  onSent,
}: {
  productKey: string;
  productName: string;
  currentRecipe: string[];
  /** "main>code/percent" — shown (and editable) for an Admin. */
  currentAlternates?: string[];
  /** Called with the new recipe when it was applied straight away (Admin), else null. */
  onClose: (applied: string[] | null) => void;
  /** Called when the change was sent to an Admin for approval. */
  onSent?: () => void;
}) {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const listId = useId();
  const [rows, setRows] = useState<Row[]>(() => (currentRecipe.length ? rowsFrom(currentRecipe) : [{ key: nextKey++, code: "", percent: "" }]));
  const [alts, setAlts] = useState<AltRow[]>(() => altRowsFrom(currentAlternates));
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
  const totalOk = Math.abs(total - 100) < 0.005;
  const mains = [...new Set(rows.map((r) => r.code.trim().toLowerCase()).filter(Boolean))];
  const updateAlt = (key: number, patch: Partial<AltRow>) => {
    setAlts((as) => as.map((a) => (a.key === key ? { ...a, ...patch } : a)));
    setError(null);
  };
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
    const sum = recipe.reduce((t, r) => t + Math.round((r.percent ?? 0) * 100), 0);
    if (sum !== 10_000) return setError(`The percents add up to ${sum / 100}% — they must make exactly 100%.`);
    let alternates: AlternateInput[] | undefined;
    if (isAdmin) {
      alternates = [];
      for (const a of alts.filter((x) => x.code.trim() || x.percent.trim())) {
        const p = Number(a.percent);
        if (!a.main) return setError("Choose which material each alternate replaces.");
        if (!a.code.trim()) return setError("Every alternate needs a material code.");
        if (!a.percent.trim() || !Number.isFinite(p) || p <= 0 || p > 100) {
          return setError(`Alternate ${a.code}: give its % (above 0, at most 100).`);
        }
        alternates.push({ for: a.main, code: a.code.trim(), percent: p });
      }
    }
    if (!isAdmin && !reason.trim()) return setError("Say why the recipe should change.");
    setBusy(true);
    try {
      const result = await requestRecipeChange(productKey, recipe, reason, alternates);
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
            <p className="text-[12px] text-ink-muted">{productName} · all pack sizes</p>
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
              <p className="flex items-center gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
                <Clock className="size-3.5 shrink-0" />
                {waiting.requestedBy}'s change is waiting for approval.{isAdmin ? " Saving yours replaces it." : ""}
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
              <span>Ingredient</span>
              <span className="text-center" title="Leave empty for an ingredient without a percent.">%</span>
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
              <span
                className={clsx("num flex items-center gap-1 text-[12px]", totalOk ? "text-success" : "text-danger")}
                title={totalOk ? undefined : "The percents must add up to exactly 100%."}
              >
                {totalOk ? null : <AlertTriangle className="size-3.5" />}
                Total {Math.round(total * 100) / 100}%{totalOk ? "" : " — must be 100%"}
              </span>
            </div>

            {isAdmin ? (
              <div className="space-y-2 rounded-md bg-canvas px-3 py-2.5">
                <p className="text-[12px] font-medium text-ink">
                  Alternates <span className="font-normal text-ink-muted">— other materials that can be used instead, with their own %</span>
                </p>
                {alts.map((a) => (
                  <div key={a.key} className="grid grid-cols-[1fr_1fr_90px_32px] items-center gap-2">
                    <Select aria-label="Replaces" value={a.main} onChange={(e) => updateAlt(a.key, { main: e.target.value })}>
                      <option value="">Replaces…</option>
                      {mains.map((m) => (
                        <option key={m} value={m}>
                          Instead of {m}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label="Alternate material code"
                      value={a.code}
                      onChange={(e) => updateAlt(a.key, { code: e.target.value })}
                      list={listId}
                      placeholder="e.g. w150n"
                      className="font-mono"
                    />
                    <div className="relative">
                      <Input
                        aria-label="Alternate percent"
                        value={a.percent}
                        onChange={(e) => updateAlt(a.key, { percent: e.target.value })}
                        inputMode="decimal"
                        placeholder="%"
                        className="num [&_input]:pr-6"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[12px] text-ink-muted">%</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-1.5"
                      aria-label="Remove alternate"
                      onClick={() => setAlts((as) => as.filter((x) => x.key !== a.key))}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus className="size-3.5" />}
                  onClick={() => setAlts((as) => [...as, { key: nextKey++, main: mains[0] ?? "", code: "", percent: "" }])}
                >
                  Add alternate
                </Button>
              </div>
            ) : null}

            <Input
              aria-label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder={isAdmin ? "Reason (optional)" : "Reason, e.g. more W150 flows better in winter"}
            />

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
