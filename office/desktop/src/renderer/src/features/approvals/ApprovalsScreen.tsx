import clsx from "clsx";
import { BellRing, Check, Factory, X } from "lucide-react";
import { useState } from "react";
import { formatQuantity, parseRecipe, type BaseUnit } from "@technofluid/core";
import { Badge, Button, EmptyState, Input, Spinner } from "@/components/ui";
import { useProductionRequests } from "@/hooks/useProductionRequests";
import { useRecipeRequests } from "@/hooks/useRecipeRequests";
import { decideProductionRequest, type ProductionRequest } from "@/services/productionService";
import { decideRecipeChange, type RecipeRequest } from "@/services/recipeService";

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const STATUS: Record<RecipeRequest["status"], { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  pending: { label: "Waiting", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  superseded: { label: "Replaced", tone: "neutral" },
};

type Entry = { type: "recipe"; at: number; r: RecipeRequest } | { type: "production"; at: number; r: ProductionRequest };

/**
 * Admin's inbox: recipe changes and production entries that changed a recipe, waiting
 * for approval, and what was decided recently.
 */
export function ApprovalsScreen() {
  const recipePending = useRecipeRequests({ pending: true });
  const recipeRecent = useRecipeRequests({ latest: 30 });
  const prodPending = useProductionRequests({ pending: true });
  const prodRecent = useProductionRequests({ latest: 30 });

  const entries = (recipes: RecipeRequest[], runs: ProductionRequest[]): Entry[] =>
    [
      ...recipes.map((r): Entry => ({ type: "recipe", at: r.requestedAt?.getTime() ?? 0, r })),
      ...runs.map((r): Entry => ({ type: "production", at: r.requestedAt?.getTime() ?? 0, r })),
    ].sort((a, b) => b.at - a.at);
  const pending: { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Entry[] } =
    recipePending.status === "error"
      ? recipePending
      : prodPending.status === "error"
        ? prodPending
        : recipePending.status === "ready" && prodPending.status === "ready"
          ? { status: "ready", data: entries(recipePending.data, prodPending.data) }
          : { status: "loading" };
  const decided = entries(
    recipeRecent.status === "ready" ? recipeRecent.data.filter((r) => r.status !== "pending") : [],
    prodRecent.status === "ready" ? prodRecent.data.filter((r) => r.status !== "pending") : [],
  ).slice(0, 30);
  const card = (e: Entry) =>
    e.type === "recipe" ? <RequestCard key={`r-${e.r.id}`} request={e.r} /> : <ProductionCard key={`p-${e.r.id}`} request={e.r} />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-5 py-5">
        <section>
          <h2 className="mb-3 text-[14px] font-semibold text-ink">
            Waiting for your approval
            {pending.status === "ready" && pending.data.length > 0 ? (
              <Badge tone="warning" className="ml-2 align-middle">
                {pending.data.length}
              </Badge>
            ) : null}
          </h2>
          {pending.status === "loading" ? (
            <Spinner />
          ) : pending.status === "error" ? (
            <p className="text-[12px] text-danger">{pending.message}</p>
          ) : pending.data.length === 0 ? (
            <EmptyState icon={<BellRing className="size-6" />} title="Nothing waiting">
              Recipe changes and production entries from Stock & Production show up here.
            </EmptyState>
          ) : (
            <div className="space-y-3">{pending.data.map(card)}</div>
          )}
        </section>

        {decided.length > 0 ? (
          <section>
            <h2 className="mb-3 text-[14px] font-semibold text-ink">Recently decided</h2>
            <div className="space-y-3">{decided.map(card)}</div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function RequestCard({ request: r }: { request: RecipeRequest }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS[r.status];

  const decide = async (decision: "approve" | "reject") => {
    setError(null);
    if (decision === "reject" && !note.trim()) return setError("Say why it's rejected — the person who asked will see it.");
    setBusy(decision);
    try {
      await decideRecipeChange(r.id, decision, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={clsx("rounded-lg border bg-surface", r.status === "pending" ? "border-brand-orange/40" : "border-line")}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[13px] font-semibold text-ink">Recipe change: {r.productName}</span>
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="flex-1" />
        <span className="text-2xs text-ink-faint">
          Asked by {r.requestedBy} · {when(r.requestedAt)}
        </span>
      </header>
      <div className="space-y-3 px-4 py-3">
        {r.reason ? (
          <p className="text-[13px] text-ink">
            <span className="text-ink-muted">Why: </span>
            {r.reason}
          </p>
        ) : null}
        <RecipeDiff current={r.currentRecipe} proposed={r.proposedRecipe} />
        {r.status === "pending" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (required to reject)"
              maxLength={300}
              className="min-w-60 flex-1"
            />
            <Button size="sm" onClick={() => void decide("reject")} loading={busy === "reject"} disabled={busy !== null} icon={<X className="size-3.5" />}>
              Reject
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void decide("approve")}
              loading={busy === "approve"}
              disabled={busy !== null}
              icon={<Check className="size-3.5" />}
            >
              Approve
            </Button>
          </div>
        ) : (
          <p className="text-[12px] text-ink-muted">
            {status.label} by {r.decidedBy ?? "—"} · {when(r.decidedAt)}
            {r.decisionNote ? ` · “${r.decisionNote}”` : ""}
          </p>
        )}
        {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
      </div>
    </article>
  );
}

/** A production entry that changed a recipe: what will be saved, and the recipe change. */
function ProductionCard({ request: r }: { request: ProductionRequest }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS[r.status];
  const made = r.display.filter((l) => l.kind === "MADE");

  const decide = async (decision: "approve" | "reject") => {
    setError(null);
    if (decision === "reject" && !note.trim()) return setError("Say why it's rejected — the person who entered it will see it.");
    setBusy(decision);
    try {
      await decideProductionRequest(r.id, decision, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const qty = (l: ProductionRequest["display"][number]) => {
    const unit = (["L", "kg", "piece"].includes(l.baseUnit) ? l.baseUnit : "L") as BaseUnit;
    const sign = l.kind === "USED" || l.kind === "OUT" ? "−" : l.kind === "COUNT" ? "= " : "+";
    return `${sign}${formatQuantity(l.qtyMilli, unit)}`;
  };
  const KIND: Record<string, string> = { MADE: "Made", USED: "Used", IN: "In", OUT: "Out", COUNT: "Counted", OPENING: "Opening" };

  return (
    <article className={clsx("rounded-lg border bg-surface", r.status === "pending" ? "border-brand-orange/40" : "border-line")}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Factory className="size-4 text-brand-orange" />
        <span className="text-[13px] font-semibold text-ink">
          Production with recipe change: {made.map((l) => `${l.itemName} ${qty(l).slice(1)}`).join(", ") || "—"}
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="flex-1" />
        <span className="text-2xs text-ink-faint">
          Entered by {r.requestedBy} · {when(r.requestedAt)} · for {r.journalDate}
        </span>
      </header>
      <div className="space-y-3 px-4 py-3">
        {r.reason ? (
          <p className="text-[13px] text-ink">
            <span className="text-ink-muted">Why: </span>
            {r.reason}
          </p>
        ) : null}
        {r.recipeChanges.map((c) => (
          <div key={c.key}>
            <p className="mb-1 text-[12px] font-medium text-ink">Recipe of {c.productName}</p>
            <RecipeDiff current={c.currentRecipe} proposed={c.proposedRecipe} />
          </div>
        ))}
        <div>
          <p className="mb-1 text-[12px] font-medium text-ink">Stock saved when approved</p>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {r.display.map((l, i) => (
                <tr key={i} className="border-b border-line/70">
                  <td className="w-24 py-1.5 pr-3 text-[12px] text-ink-muted">{KIND[l.kind] ?? l.kind}</td>
                  <td className="py-1.5 pr-3 text-ink">{l.itemName}</td>
                  <td
                    className={clsx(
                      "num py-1.5 text-right font-semibold",
                      l.kind === "USED" || l.kind === "OUT" ? "text-danger" : "text-success",
                    )}
                  >
                    {qty(l)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.status === "pending" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (required to reject)"
              maxLength={300}
              className="min-w-60 flex-1"
            />
            <Button size="sm" onClick={() => void decide("reject")} loading={busy === "reject"} disabled={busy !== null} icon={<X className="size-3.5" />}>
              Reject
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void decide("approve")}
              loading={busy === "approve"}
              disabled={busy !== null}
              icon={<Check className="size-3.5" />}
            >
              Approve and save
            </Button>
          </div>
        ) : (
          <p className="text-[12px] text-ink-muted">
            {status.label} by {r.decidedBy ?? "—"} · {when(r.decidedAt)}
            {r.decisionNote ? ` · “${r.decisionNote}”` : ""}
          </p>
        )}
        {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
      </div>
    </article>
  );
}

/** Current vs proposed, ingredient by ingredient; added, removed and changed lines marked. */
export function RecipeDiff({ current, proposed }: { current: string[]; proposed: string[] }) {
  const now = parseRecipe(current);
  const next = parseRecipe(proposed);
  const codes = [...new Set([...now.map((i) => i.code), ...next.map((i) => i.code)])];
  const pct = (bp: number | null | undefined) => (bp === undefined ? "—" : bp === null ? "no %" : `${bp / 100}%`);
  const total = (list: typeof now) => list.reduce((s, i) => s + (i.percentBp ?? 0), 0) / 100;

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-line text-center text-2xs font-medium tracking-wide text-ink-muted uppercase">
          <th className="px-3 py-1.5 text-left font-medium">Ingredient</th>
          <th className="px-3 py-1.5 font-medium">Current</th>
          <th className="px-3 py-1.5 font-medium">Proposed</th>
          <th className="px-3 py-1.5 font-medium">Change</th>
        </tr>
      </thead>
      <tbody>
        {codes.map((code) => {
          const a = now.find((i) => i.code === code);
          const b = next.find((i) => i.code === code);
          const change = !a ? "Added" : !b ? "Removed" : a.percentBp !== b.percentBp ? "Changed" : "";
          return (
            <tr key={code} className={clsx("border-b border-line/70 text-center", change && "bg-brand-orange/[0.04]")}>
              <td className="px-3 py-1.5 text-left font-mono text-[12px] text-ink">{code}</td>
              <td className={clsx("num px-3 py-1.5", !b && a && "text-danger line-through")}>{pct(a?.percentBp)}</td>
              <td className={clsx("num px-3 py-1.5", change ? "font-semibold text-ink" : "text-ink-muted")}>{pct(b?.percentBp)}</td>
              <td className="px-3 py-1.5 text-[12px]">
                {change ? <Badge tone={change === "Removed" ? "danger" : change === "Added" ? "success" : "warning"}>{change}</Badge> : null}
              </td>
            </tr>
          );
        })}
        <tr className="text-center text-[12px] text-ink-muted">
          <td className="px-3 py-1.5 text-left">Total</td>
          <td className="num px-3 py-1.5">{total(now)}%</td>
          <td className="num px-3 py-1.5">{total(next)}%</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}
