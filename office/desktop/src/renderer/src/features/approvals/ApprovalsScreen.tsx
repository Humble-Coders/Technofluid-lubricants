import clsx from "clsx";
import { BellRing, Check, X } from "lucide-react";
import { useState } from "react";
import { parseRecipe } from "@technofluid/core";
import { Badge, Button, EmptyState, Input, Spinner } from "@/components/ui";
import { useRecipeRequests } from "@/hooks/useRecipeRequests";
import { decideRecipeChange, type RecipeRequest } from "@/services/recipeService";

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const STATUS: Record<RecipeRequest["status"], { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  pending: { label: "Waiting", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  superseded: { label: "Replaced", tone: "neutral" },
};

/** Admin's inbox: recipe changes waiting for approval, and what was decided recently. */
export function ApprovalsScreen() {
  const pending = useRecipeRequests({ pending: true });
  const recent = useRecipeRequests({ latest: 30 });
  const decided = recent.status === "ready" ? recent.data.filter((r) => r.status !== "pending") : [];

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
              Recipe changes asked for by Stock & Production show up here.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {pending.data.map((r) => (
                <RequestCard key={r.id} request={r} />
              ))}
            </div>
          )}
        </section>

        {decided.length > 0 ? (
          <section>
            <h2 className="mb-3 text-[14px] font-semibold text-ink">Recently decided</h2>
            <div className="space-y-3">
              {decided.map((r) => (
                <RequestCard key={r.id} request={r} />
              ))}
            </div>
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
