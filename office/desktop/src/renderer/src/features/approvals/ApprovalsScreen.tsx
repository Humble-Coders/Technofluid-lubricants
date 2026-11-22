import { BellRing, Check, Factory, X } from "lucide-react";
import { useState } from "react";
import { formatQuantity, parseRecipe, type BaseUnit } from "@technofluid/core";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Page, PageHeader, Section, Table, Td, Th, Tr } from "@/components/ui";
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
    <Page>
      <PageHeader
        title="Approvals"
        badge={pending.status === "ready" && pending.data.length > 0 ? <Badge tone="warning">{pending.data.length} waiting</Badge> : null}
      />

      <Section title="Waiting for your approval" className="mt-0!">
        {pending.status === "loading" ? (
          <LoadingState />
        ) : pending.status === "error" ? (
          <ErrorState>{pending.message}</ErrorState>
        ) : pending.data.length === 0 ? (
          <EmptyState icon={<BellRing />} title="Nothing waiting">
            Recipe changes and production entries from Stock & Production show up here.
          </EmptyState>
        ) : (
          <div className="border-t border-line-row">{pending.data.map(card)}</div>
        )}
      </Section>

      {decided.length > 0 ? (
        <Section title="Recently decided">
          <div className="border-t border-line-row">{decided.map(card)}</div>
        </Section>
      ) : null}
    </Page>
  );
}

const REQUEST = "border-b border-line-row py-5";
const REQUEST_HEAD = "flex flex-wrap items-center gap-x-2 gap-y-1";
const REQUEST_BODY = "mt-3 max-w-2xl space-y-4";

function RequestCard({ request: r }: { request: RecipeRequest }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS[r.status];

  const decide = async (decision: "approve" | "reject") => {
    setError(null);
    if (decision === "reject" && !note.trim()) return setError("Say why it's rejected. The person who asked will see it.");
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
    <article className={REQUEST}>
      <header className={REQUEST_HEAD}>
        <h3 className="text-body font-semibold text-ink">Recipe change: {r.productName}</h3>
        {r.status === "approved" ? null : <Badge tone={status.tone}>{status.label}</Badge>}
        <span className="flex-1" />
        <span className="text-caption text-ink-subtle">
          Asked by {r.requestedBy} · {when(r.requestedAt)}
        </span>
      </header>
      <div className={REQUEST_BODY}>
        {r.reason ? (
          <p className="text-body text-ink">
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
            <Button onClick={() => void decide("reject")} loading={busy === "reject"} disabled={busy !== null} icon={<X />}>
              Reject
            </Button>
            <Button variant="primary" onClick={() => void decide("approve")} loading={busy === "approve"} disabled={busy !== null} icon={<Check />}>
              Approve
            </Button>
          </div>
        ) : (
          <p className="text-label text-ink-muted">
            {status.label} by {r.decidedBy ?? "-"} · {when(r.decidedAt)}
            {r.decisionNote ? ` · “${r.decisionNote}”` : ""}
          </p>
        )}
        {error ? (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        ) : null}
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
    if (decision === "reject" && !note.trim()) return setError("Say why it's rejected. The person who entered it will see it.");
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
    <article className={REQUEST}>
      <header className={REQUEST_HEAD}>
        <Factory className="size-4 shrink-0 text-ink-subtle" aria-hidden />
        <h3 className="text-body font-semibold text-ink">
          Production with recipe change: {made.map((l) => `${l.itemName} ${qty(l).slice(1)}`).join(", ") || "-"}
        </h3>
        {r.status === "approved" ? null : <Badge tone={status.tone}>{status.label}</Badge>}
        <span className="flex-1" />
        <span className="text-caption text-ink-subtle">
          Entered by {r.requestedBy} · {when(r.requestedAt)} · for {r.journalDate}
        </span>
      </header>
      <div className={REQUEST_BODY}>
        {r.reason ? (
          <p className="text-body text-ink">
            <span className="text-ink-muted">Why: </span>
            {r.reason}
          </p>
        ) : null}
        {r.recipeChanges.map((c) => (
          <div key={c.key}>
            <p className="text-label font-medium text-ink">Recipe of {c.productName}</p>
            <RecipeDiff current={c.currentRecipe} proposed={c.proposedRecipe} />
          </div>
        ))}
        <div>
          <p className="text-label font-medium text-ink">Stock saved when approved</p>
          <Table>
            <tbody>
              {r.display.map((l, i) => (
                <Tr key={i}>
                  <Td muted className="w-28">
                    {KIND[l.kind] ?? l.kind}
                  </Td>
                  <Td>{l.itemName}</Td>
                  <Td num className="font-medium">
                    {qty(l)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
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
            <Button onClick={() => void decide("reject")} loading={busy === "reject"} disabled={busy !== null} icon={<X />}>
              Reject
            </Button>
            <Button variant="primary" onClick={() => void decide("approve")} loading={busy === "approve"} disabled={busy !== null} icon={<Check />}>
              Approve and save
            </Button>
          </div>
        ) : (
          <p className="text-label text-ink-muted">
            {status.label} by {r.decidedBy ?? "-"} · {when(r.decidedAt)}
            {r.decisionNote ? ` · “${r.decisionNote}”` : ""}
          </p>
        )}
        {error ? (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** Current vs proposed, ingredient by ingredient; added, removed and changed lines marked. */
export function RecipeDiff({ current, proposed }: { current: string[]; proposed: string[] }) {
  const now = parseRecipe(current);
  const next = parseRecipe(proposed);
  const codes = [...new Set([...now.map((i) => i.code), ...next.map((i) => i.code)])];
  const pct = (bp: number | null | undefined) => (bp === undefined ? "-" : bp === null ? "no %" : `${bp / 100}%`);
  const total = (list: typeof now) => list.reduce((s, i) => s + (i.percentBp ?? 0), 0) / 100;

  return (
    <Table>
      <thead>
        <tr>
          <Th>Ingredient</Th>
          <Th align="right">Current</Th>
          <Th align="right">Proposed</Th>
          <Th className="w-28">Change</Th>
        </tr>
      </thead>
      <tbody>
        {codes.map((code) => {
          const a = now.find((i) => i.code === code);
          const b = next.find((i) => i.code === code);
          const change = !a ? "Added" : !b ? "Removed" : a.percentBp !== b.percentBp ? "Changed" : "";
          return (
            <Tr key={code}>
              <Td className="font-mono text-label">{code}</Td>
              <Td num muted>
                {!b && a ? <span className="text-danger line-through">{pct(a.percentBp)}</span> : pct(a?.percentBp)}
              </Td>
              <Td num muted={!change} className={change ? "font-semibold" : undefined}>
                {pct(b?.percentBp)}
              </Td>
              <Td>{change ? <Badge tone={change === "Removed" ? "danger" : change === "Added" ? "success" : "warning"}>{change}</Badge> : null}</Td>
            </Tr>
          );
        })}
        <Tr>
          <Td muted>Total</Td>
          <Td num muted>
            {total(now)}%
          </Td>
          <Td num muted>
            {total(next)}%
          </Td>
          <Td />
        </Tr>
      </tbody>
    </Table>
  );
}
