import clsx from "clsx";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Check, CheckCircle2, ClipboardPen, FileText, Flag, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { indiaDate, parseQuantityToMilli } from "@technofluid/core";
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

// Counts are corrected from an item's panel (Edit beside On hand), not here.
type LineKind = "IN" | "OUT" | "OPENING";
interface Draft {
  key: number;
  item: StockItem | null;
  kind: LineKind;
  qty: string;
  note: string;
}

/** "2026-10-15" → "15 Oct 2026". */
const shortDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** One journal line: item · type · quantity (+unit) · reason · remove. Fits the card at any width. */
const LINE_GRID = "grid grid-cols-[minmax(150px,2fr)_minmax(130px,1.3fr)_minmax(110px,1fr)_minmax(120px,2fr)_28px] gap-3";
const TALL = "[&_input]:h-9 [&_select]:h-9";

const KIND_OPTIONS: Array<[LineKind, string]> = [
  ["IN", "In"],
  ["OUT", "Out"],
  ["OPENING", "Opening stock"],
];
const KIND_ICON = { IN: ArrowDownToLine, OUT: ArrowUpFromLine, OPENING: Flag } satisfies Record<LineKind, unknown>;

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
      ) : null}

      <div className="px-5 pt-3 pb-2">
        <form
          className="space-y-3 rounded-xl border border-line bg-surface px-5 py-3.5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            startReview();
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-orange text-white">
              <ClipboardPen className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold text-ink">{canEdit ? "Add to stock journal" : "Stock journal"}</h2>
              <p className="text-[12px] text-ink-muted">{canEdit ? "Stock in, out or production" : "What was recorded each day"}</p>
            </div>
            {date !== today ? (
              <Button size="sm" variant="ghost" onClick={() => setDate(today)}>
                Back to today
              </Button>
            ) : null}
            <Input
              aria-label="Journal date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className={clsx(
                "w-44 [&_input]:border-brand-orange [&_input]:bg-brand-orange/8 [&_input]:font-semibold [&_input]:text-brand-orange-dark [&_input]:hover:border-brand-orange-dark",
                TALL,
              )}
            />
          </div>

          {canEdit ? (
            <>
              <div>
                <div className={clsx(LINE_GRID, "mb-1.5 text-[12px] font-medium text-ink")}>
                  <span>Item</span>
                  <span>Type</span>
                  <span>Quantity</span>
                  <span>Reason</span>
                  <span />
                </div>
                <div className="space-y-3">
                  {lines.map((l, i) => {
                    const KindIcon = KIND_ICON[l.kind];
                    const optional = l.kind === "OPENING" || (l.kind === "IN" && l.item?.kind === "product_pool");
                    return (
                      <div key={l.key}>
                        <div className={clsx(LINE_GRID, "items-center")}>
                          <ItemPicker
                            items={items}
                            value={l.item}
                            onChange={(item) => update(l.key, { item })}
                            autoFocus={i > 0 && i === lines.length - 1}
                            className={TALL}
                            chevron
                          />
                          <div className="relative">
                            <Select
                              value={l.kind}
                              onChange={(e) => update(l.key, { kind: e.target.value as LineKind })}
                              aria-label="Type"
                              className={clsx(TALL, "[&_select]:pl-9")}
                            >
                              {KIND_OPTIONS.map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </Select>
                            <KindIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
                          </div>
                          <div className="flex">
                            <Input
                              value={l.qty}
                              onChange={(e) => update(l.key, { qty: e.target.value })}
                              inputMode="decimal"
                              placeholder="0"
                              className={clsx("num min-w-0 flex-1 [&_input]:rounded-r-none", TALL)}
                              aria-label="Quantity"
                            />
                            <span className="inline-flex h-9 min-w-11 items-center justify-center rounded-r-md border border-l-0 border-line-strong bg-canvas px-3 text-[13px] text-ink-muted">
                              {l.item ? unitWord(l.item.baseUnit) : "—"}
                            </span>
                          </div>
                          <Input
                            value={l.note}
                            onChange={(e) => update(l.key, { note: e.target.value })}
                            placeholder={optional ? "Optional" : "Add a reason…"}
                            maxLength={200}
                            aria-label="Reason"
                            leading={<FileText className="size-4" />}
                            className={TALL}
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
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-info/15 bg-info-soft px-4 text-[13px] font-medium text-info transition-colors hover:border-info/30"
                  onClick={() => setLines((ls) => [...ls, emptyLine()])}
                >
                  <Plus className="size-4" />
                  Add another line
                </button>
                <div className="flex-1" />
                {saveError ? <p role="alert" className="text-[12px] font-medium text-danger">{saveError}</p> : null}
                <Button type="submit" variant="primary" className="h-9 px-6" loading={busy} icon={<Check className="size-4" />}>
                  Review
                </Button>
              </div>
              {result ? <ResultNote result={result} /> : null}
            </>
          ) : null}
        </form>
      </div>

      <section>
        <h3 className="px-5 pt-3 pb-2 text-2xs font-medium tracking-wide text-ink-muted uppercase">
          {date === today ? "Today" : shortDate(date)}
          {recordedCount ? ` · ${recordedCount.toLocaleString("en-IN")}` : ""}
        </h3>
        <div className="overflow-x-auto">
          <MovementTable state={recorded} canEdit={canEdit} showDate={false} emptyText="Nothing recorded yet." />
        </div>
      </section>
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
