import clsx from "clsx";
import { AlertTriangle, Clock, Plus, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { parseAlternates, parseRecipe } from "@technofluid/core";
import { Banner, Button, Dialog, Field, IconButton, Input, Select } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { useRecipeRequests } from "@/hooks/useRecipeRequests";
import { useStockItems } from "@/hooks/useStock";
import { requestRecipeChange, type AlternateInput, type RecipeLineInput, type RecipeTarget } from "@/services/recipeService";

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
  target,
  productName,
  currentRecipe,
  currentAlternates = [],
  onClose,
  onSent,
}: {
  /** A product (all pack sizes) or a premix/blend stock item. */
  target: RecipeTarget;
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
  const requests = useRecipeRequests(target);
  const waiting = requests.status === "ready" ? requests.data.find((r) => r.status === "pending") : undefined;
  const codes = useMemo(
    () => (items.status === "ready" ? items.data.filter((i) => i.kind !== "product_pool" && i.code) : []),
    [items],
  );

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
      const result = await requestRecipeChange(target, recipe, reason, alternates);
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

  const formId = `${listId}-form`;
  const reasonId = `${listId}-reason`;

  if (sent) {
    return (
      <Dialog
        title="Change recipe"
        subtitle={`${productName}${"productKey" in target ? " · all pack sizes" : ""}`}
        size="md"
        onClose={() => onClose(null)}
        busy={busy}
        footer={
          <Button variant="primary" onClick={() => onClose(null)}>
            Done
          </Button>
        }
      >
        <p className="flex items-center gap-2 text-body font-medium text-ink">
          <Clock className="size-4 shrink-0 text-ink-subtle" aria-hidden /> Sent to the Admin for approval.
        </p>
        <p className="text-label text-ink-muted">
          Production keeps using the current recipe until it's approved. You'll see the result on the product.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Change recipe"
      subtitle={`${productName}${"productKey" in target ? " · all pack sizes" : ""}`}
      size="md"
      onClose={() => onClose(null)}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={() => onClose(null)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy} disabled={!isAdmin && Boolean(waiting)}>
            {busy ? (isAdmin ? "Saving…" : "Sending…") : isAdmin ? "Save recipe" : "Send for approval"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {waiting ? (
          <Banner tone="warning">
            {waiting.requestedBy}'s change is waiting for approval.{isAdmin ? " Saving yours replaces it." : ""}
          </Banner>
        ) : null}

        <datalist id={listId}>
          {codes.map((i) => (
            <option key={i.id} value={i.code ?? ""}>
              {i.name}
            </option>
          ))}
        </datalist>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_112px_32px] gap-2 text-label font-medium text-ink">
            <span>Ingredient</span>
            <span title="Leave empty for an ingredient without a percent.">Percent</span>
            <span />
          </div>
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_112px_32px] items-center gap-2">
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
                  className="num [&_input]:pr-7 [&_input]:text-right"
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-label text-ink-subtle">%</span>
              </div>
              <IconButton label="Remove ingredient" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} disabled={rows.length === 1}>
                <X />
              </IconButton>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={<Plus />} className="-ml-2.5" onClick={() => setRows((rs) => [...rs, { key: nextKey++, code: "", percent: "" }])}>
              Add ingredient
            </Button>
            <div className="flex-1" />
            <span
              className={clsx("num flex items-center gap-1 text-label", totalOk ? "text-ink-muted" : "text-danger")}
              title={totalOk ? undefined : "The percents must add up to exactly 100%."}
            >
              {totalOk ? null : <AlertTriangle className="size-3.5" />}
              Total {Math.round(total * 100) / 100}%{totalOk ? "" : " — must be 100%"}
            </span>
          </div>
        </div>

        {isAdmin ? (
          <div className="space-y-2 border-t border-line-row pt-4">
            <p className="text-label font-medium text-ink">
              Alternates <span className="font-normal text-ink-muted">— other materials that can be used instead, with their own %</span>
            </p>
            {alts.map((a) => (
              <div key={a.key} className="grid grid-cols-[1fr_1fr_88px_32px] items-center gap-2">
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
                    className="num [&_input]:pr-7 [&_input]:text-right"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-label text-ink-subtle">%</span>
                </div>
                <IconButton label="Remove alternate" onClick={() => setAlts((as) => as.filter((x) => x.key !== a.key))}>
                  <X />
                </IconButton>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus />}
              className="-ml-2.5"
              onClick={() => setAlts((as) => [...as, { key: nextKey++, main: mains[0] ?? "", code: "", percent: "" }])}
            >
              Add alternate
            </Button>
          </div>
        ) : null}

        <Field label="Reason" htmlFor={reasonId} optional={isAdmin}>
          <Input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder={isAdmin ? undefined : "e.g. more W150 flows better in winter"}
          />
        </Field>

        {error ? <Banner tone="danger">{error}</Banner> : null}
      </form>
    </Dialog>
  );
}
