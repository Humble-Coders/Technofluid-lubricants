import clsx from "clsx";
import { Pencil, Undo2 } from "lucide-react";
import { useState } from "react";
import { formatQuantity, indiaDate, parseQuantityToMilli } from "@technofluid/core";
import { Badge, Banner, Button, Input, Menu, Spinner } from "@/components/ui";
import type { LoadState } from "@/hooks/useProducts";
import { reverseStockMovement, type StockMovement } from "@/services/stockService";
import { EDITABLE_TYPES, isDocumentLine, signedQuantity, TYPE_LABEL, unitWord } from "./stockFormat";

const when = (m: StockMovement) =>
  m.createdAt
    ? m.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "Saving…";

/** "2026-10-15" → "15 Oct". */
const shortDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Who and when, plus the day it counts for only when that's a different day. */
const meta = (m: StockMovement) =>
  [m.byName, when(m), m.createdAt && indiaDate(m.createdAt) !== m.journalDate ? `for ${shortDay(m.journalDate)}` : null]
    .filter(Boolean)
    .join(" · ");

/**
 * Diary lines, newest first. Lines that were undone stay visible, struck through —
 * nothing is ever erased. Admin / Stock & Production can Undo or Edit a line.
 */
export function MovementList({
  state,
  canEdit,
  showItem = true,
  emptyText = "Nothing recorded yet.",
}: {
  state: LoadState<StockMovement[]>;
  canEdit: boolean;
  showItem?: boolean;
  emptyText?: string;
}) {
  if (state.status === "loading") return <Spinner />;
  if (state.status === "error") return <Banner tone="danger">Couldn't load the history: {state.message}</Banner>;
  if (state.data.length === 0) return <p className="text-label text-ink-muted">{emptyText}</p>;
  return (
    <ol className="border-t border-line-row">
      {state.data.map((m) => (
        <MovementRow key={m.id} m={m} canEdit={canEdit} showItem={showItem} />
      ))}
    </ol>
  );
}

function MovementRow({ m, canEdit, showItem }: { m: StockMovement; canEdit: boolean; showItem: boolean }) {
  const [mode, setMode] = useState<"undo" | "edit" | null>(null);
  const undone = Boolean(m.reversedById);
  const editable = canEdit && !undone && m.type !== "REVERSAL" && !isDocumentLine(m.type);

  return (
    <li className="border-b border-line-row py-2.5 text-label">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={clsx("num text-body font-medium", undone ? "text-ink-subtle line-through" : "text-ink")}>
              {signedQuantity(m.qtyMilli, m.baseUnit)}
            </span>
            {showItem ? <span className={clsx("font-medium", undone ? "text-ink-subtle line-through" : "text-ink")}>{m.itemName}</span> : null}
            <span className={clsx(undone ? "text-ink-subtle line-through" : "text-ink-muted")}>{TYPE_LABEL[m.type] ?? m.type}</span>
            {m.replacesId ? <Badge tone="neutral">Edited</Badge> : null}
            {undone ? <Badge tone="neutral">Undone</Badge> : null}
          </p>
          {m.note ? <p className="mt-0.5 text-ink-muted">{m.note}</p> : null}
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-caption text-ink-subtle">
            <span>{meta(m)}</span>
            {undone ? null : (
              <span className="num" title="On hand after this line">
                {m.countedMilli !== null ? "Counted " : "→ "}
                {formatQuantity(m.countedMilli ?? m.onHandAfterMilli, m.baseUnit)}
              </span>
            )}
          </p>
        </div>
        {editable && !mode ? (
          <div className="shrink-0">
            <Menu
              size="sm"
              label="Line actions"
              items={[
                EDITABLE_TYPES.includes(m.type) ? { label: "Edit", icon: <Pencil />, onSelect: () => setMode("edit") } : null,
                { label: "Undo", icon: <Undo2 />, onSelect: () => setMode("undo") },
              ]}
            />
          </div>
        ) : null}
      </div>
      {mode ? (
        <div className="mt-2">
          <UndoForm m={m} edit={mode === "edit"} onDone={() => setMode(null)} />
        </div>
      ) : null}
    </li>
  );
}

export function UndoForm({ m, edit, onDone }: { m: StockMovement; edit: boolean; onDone: () => void }) {
  const [qty, setQty] = useState(edit ? formatQuantity(Math.abs(m.qtyMilli), m.baseUnit).replace(/[^\d.,]/g, "") : "");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!why.trim()) return setError("Say why.");
    let replacement: number | undefined;
    if (edit) {
      try {
        replacement = parseQuantityToMilli(qty);
      } catch {
        return setError("Enter a quantity like 26 or 17.5.");
      }
      if (m.type !== "OPENING" && replacement === 0) return setError("Use Undo to remove a line.");
    }
    setBusy(true);
    try {
      await reverseStockMovement(m.id, why.trim(), replacement);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
    >
      {edit ? (
        <div className="flex items-center gap-1.5">
          <Input
            aria-label="Correct quantity"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            className="num w-24"
            autoFocus
          />
          <span className="text-label text-ink-muted">{unitWord(m.baseUnit)}</span>
        </div>
      ) : null}
      <Input
        aria-label="Reason"
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder={edit ? "Why change it?" : "Why undo it?"}
        className="min-w-40 flex-1"
        autoFocus={!edit}
        maxLength={200}
      />
      <Button variant="ghost" onClick={onDone} disabled={busy}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" loading={busy}>
        {edit ? "Save change" : "Undo line"}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-caption text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
