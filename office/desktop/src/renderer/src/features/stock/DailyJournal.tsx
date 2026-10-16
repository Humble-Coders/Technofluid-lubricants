import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatQuantity, indiaDate, parseQuantityToMilli } from "@technofluid/core";
import { Button, Input, Select } from "@/components/ui";
import { useMovements } from "@/hooks/useStock";
import type { Product } from "@/services/productService";
import {
  newRequestId,
  recordStockMovements,
  type RecordResult,
  type StockItem,
} from "@/services/stockService";
import { ItemPicker } from "./ItemPicker";
import { JournalReview } from "./JournalReview";
import { buildReview, readReview, type DraftLine, type ReviewGroup, type ReviewProblem } from "./reviewModel";
import { MovementTable } from "./MovementTable";
import { unitWord } from "./stockFormat";

type LineKind = "IN" | "OUT" | "COUNT" | "OPENING";
interface Draft {
  key: number;
  item: StockItem | null;
  kind: LineKind;
  qty: string;
  note: string;
}

/** One journal line: item · what happened · quantity (+unit) · why · remove. Fits the card at any width. */
const LINE_GRID = "grid grid-cols-[minmax(150px,2fr)_minmax(120px,1fr)_minmax(110px,1fr)_minmax(120px,2fr)_28px] gap-2";

const KIND_OPTIONS: Array<[LineKind, string]> = [
  ["IN", "In"],
  ["OUT", "Out"],
  ["COUNT", "Counted (set to)"],
  ["OPENING", "Opening stock"],
];

let nextKey = 1;
const emptyLine = (): Draft => ({ key: nextKey++, item: null, kind: "IN", qty: "", note: "" });

/**
 * The supervisor's daily stock journal (decision #24): one business date, many lines,
 * saved together. Below it, everything already recorded for that date.
 *
 * A product "In" is production (Sharnya, 16 Oct 2026): Review proposes the raw materials
 * it used from the recipe; the person edits, then confirms — only then is anything saved
 * (decision #20).
 */
export function DailyJournal({ items, products, canEdit }: { items: StockItem[]; products: Product[]; canEdit: boolean }) {
  const today = indiaDate();
  const [date, setDate] = useState(today);
  const [lines, setLines] = useState<Draft[]>(() => [emptyLine()]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  // Same id until it succeeds, so pressing Save again after a failure can't double-record.
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RecordResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewGroup[] | null>(null);
  const [problems, setProblems] = useState<ReviewProblem[]>([]);
  const recorded = useMovements({ journalDate: date });

  const update = (key: number, patch: Partial<Draft>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setErrors((e) => ({ ...e, [key]: "" }));
    setResult(null);
  };

  /** Step 1: check the entries, then show the review (nothing saved yet). */
  const startReview = () => {
    setSaveError(null);
    setResult(null);
    const found: Record<number, string> = {};
    const out: DraftLine[] = [];
    const filled = lines.filter((l) => l.item || l.qty.trim() || l.note.trim());
    for (const l of filled) {
      if (!l.item) {
        found[l.key] = "Choose an item.";
        continue;
      }
      let milli: number;
      try {
        milli = parseQuantityToMilli(l.qty);
      } catch {
        found[l.key] = "Enter a quantity like 26 or 17.5.";
        continue;
      }
      if ((l.kind === "IN" || l.kind === "OUT") && milli === 0) {
        found[l.key] = "Quantity must be above 0.";
        continue;
      }
      const production = l.item.kind === "product_pool" && l.kind === "IN";
      if (l.kind !== "OPENING" && !production && !l.note.trim()) {
        found[l.key] = "Say why.";
        continue;
      }
      out.push({ item: l.item, kind: l.kind, qtyMilli: milli, note: l.note.trim() });
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return setSaveError("Some lines need fixing first — see the red notes under them.");
    }
    if (out.length === 0) return setSaveError("Add at least one line.");
    setProblems([]);
    setReview(buildReview(out, items, products));
  };

  /** Step 2: the person confirmed the review — save everything in one go. */
  const confirm = async () => {
    if (!review) return;
    setSaveError(null);
    const { lines: toSave, problems: found } = readReview(review);
    setProblems(found);
    if (found.length > 0) return setSaveError("Fix the highlighted lines first.");
    if (toSave.length === 0) return setSaveError("Nothing to save.");
    setBusy(true);
    try {
      const r = await recordStockMovements(requestId, date, toSave);
      setResult(r);
      setReview(null);
      setLines([emptyLine()]);
      setRequestId(newRequestId());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const recordedCount = recorded.status === "ready" ? recorded.data.length : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar — same place as the History filters. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-2.5">
        <label htmlFor="journal-date" className="text-[13px] font-medium text-ink">
          Stock journal for
        </label>
        <Input
          id="journal-date"
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="w-44"
        />
        {date !== today ? (
          <Button size="sm" variant="ghost" onClick={() => setDate(today)}>
            Back to today
          </Button>
        ) : null}
        <div className="flex-1" />
        {recordedCount !== null ? (
          <span className="num text-[12px] text-ink-muted">
            {recordedCount.toLocaleString("en-IN")} {recordedCount === 1 ? "line" : "lines"} recorded
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {canEdit && review ? (
          <JournalReview
            groups={review}
            onChange={(groups) => {
              setReview(groups);
              setProblems([]);
            }}
            items={items}
            products={products}
            problems={problems}
            busy={busy}
            error={saveError}
            onBack={() => {
              setReview(null);
              setSaveError(null);
            }}
            onConfirm={() => void confirm()}
          />
        ) : canEdit ? (
          <form
            className="space-y-2 border-b border-line bg-surface px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              startReview();
            }}
          >
            <h3 className="pb-1 text-[13px] font-semibold text-ink">New entries</h3>
            <div className={clsx(LINE_GRID, "text-2xs font-medium tracking-wide text-ink-muted uppercase")}>
              <span>Item</span>
              <span>What happened</span>
              <span>Quantity</span>
              <span>Why</span>
              <span />
            </div>
            {lines.map((l, i) => (
              <div key={l.key}>
                <div className={clsx(LINE_GRID, "items-center")}>
                  <ItemPicker items={items} value={l.item} onChange={(item) => update(l.key, { item })} autoFocus={i > 0 && i === lines.length - 1} />
                  <Select value={l.kind} onChange={(e) => update(l.key, { kind: e.target.value as LineKind })} aria-label="What happened">
                    {KIND_OPTIONS.map(([k, label]) => (
                      <option key={k} value={k}>
                        {k === "IN" && l.item?.kind === "product_pool" ? "Made (uses recipe)" : label}
                      </option>
                    ))}
                  </Select>
                  <div className="relative">
                    <Input
                      value={l.qty}
                      onChange={(e) => update(l.key, { qty: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      className="num [&_input]:pr-12"
                      aria-label="Quantity"
                    />
                    {l.item ? (
                      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-ink-muted">
                        {unitWord(l.item.baseUnit)}
                      </span>
                    ) : null}
                  </div>
                  <Input
                    value={l.note}
                    onChange={(e) => update(l.key, { note: e.target.value })}
                    placeholder={l.kind === "OPENING" || (l.kind === "IN" && l.item?.kind === "product_pool") ? "Optional" : "e.g. filled from tank 2"}
                    maxLength={200}
                    aria-label="Why"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove line"
                    className="px-1.5"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {errors[l.key] ? <p className="mt-1 text-[12px] text-danger">{errors[l.key]}</p> : null}
                {l.item && l.kind === "COUNT" ? (
                  <p className="mt-1 text-[12px] text-ink-faint">
                    Shows {formatQuantity(l.item.onHandMilli, l.item.baseUnit)} now — the difference is recorded.
                  </p>
                ) : null}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])} icon={<Plus className="size-3.5" />}>
                Add line
              </Button>
              <div className="flex-1" />
              {saveError ? <p role="alert" className="text-[12px] font-medium text-danger">{saveError}</p> : null}
              <Button type="submit" variant="primary" size="sm" loading={busy}>
                Review
              </Button>
            </div>
            {result ? <ResultNote result={result} /> : null}
          </form>
        ) : null}

        <section>
          <h3 className="px-5 pt-4 pb-2 text-2xs font-medium tracking-wide text-ink-muted uppercase">
            Recorded for {date === today ? "today" : date}
          </h3>
          <div className="overflow-x-auto">
            <MovementTable state={recorded} canEdit={canEdit} showDate={false} emptyText="Nothing recorded for this date." />
          </div>
        </section>
      </div>
    </div>
  );
}

function ResultNote({ result }: { result: RecordResult }) {
  return (
    <div className="space-y-1 text-[12px]">
      <p className={clsx("flex items-center gap-1.5", result.recorded > 0 ? "text-success" : "text-ink-muted")}>
        <CheckCircle2 className="size-3.5" />
        {result.alreadyRecorded
          ? "Already saved."
          : `Saved ${result.recorded} ${result.recorded === 1 ? "line" : "lines"}.`}
        {result.skipped.length > 0 ? ` ${result.skipped.length} unchanged (count already matched).` : ""}
      </p>
      {result.belowZero.map((b) => (
        <p key={b.itemId} className="flex items-center gap-1.5 text-warning">
          <AlertTriangle className="size-3.5" /> {b.name} is now below zero — count it and correct.
        </p>
      ))}
    </div>
  );
}
