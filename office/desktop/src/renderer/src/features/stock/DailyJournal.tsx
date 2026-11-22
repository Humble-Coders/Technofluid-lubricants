import clsx from "clsx";
import { ArrowDownToLine, ArrowUpFromLine, Check, Flag, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { indiaDate, parseQuantityToMilli } from "@technofluid/core";
import { Banner, Button, IconButton, Input, Section, Select } from "@/components/ui";
import { useMovements } from "@/hooks/useStock";
import type { Product } from "@/services/productService";
import {
  newRequestId,
  recordStockMovements,
  type RecordResult,
  type StockItem,
} from "@/services/stockService";
import { ItemPicker } from "./ItemPicker";
import { requestProduction } from "@/services/productionService";
import { JournalReview, type RecipeConfirm } from "./JournalReview";
import { buildReview, isMade, readReview, type DraftLine, type ReviewGroup, type ReviewProblem } from "./reviewModel";
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

/** One journal line: item · type · quantity (+unit) · reason · remove. Fits the page at any width. */
const LINE_GRID = "grid grid-cols-[minmax(150px,2fr)_minmax(130px,1.3fr)_minmax(110px,1fr)_minmax(120px,2fr)_32px] gap-3";

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
  const [result, setResult] = useState<(RecordResult & { sentForApproval?: boolean }) | null>(null);
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
      if (!l.item.unitSet) {
        found[l.key] = `${l.item.name} has no unit yet — an Admin must set it first (Live stock → Edit).`;
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
      const production = isMade(l.item) && l.kind === "IN";
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

  /**
   * Step 2: the person confirmed the review — save everything in one go. With a changed
   * recipe it goes to requestProduction instead: Stock & Production's waits for an Admin.
   */
  const confirm = async (recipe: RecipeConfirm | null) => {
    if (!review) return;
    setSaveError(null);
    const { lines: toSave, problems: found } = readReview(review);
    setProblems(found);
    if (found.length > 0) return setSaveError("Fix the highlighted lines first.");
    if (toSave.length === 0) return setSaveError("Nothing to save.");
    setBusy(true);
    try {
      if (recipe) {
        const r = await requestProduction(requestId, date, toSave, recipe.recipeChanges, recipe.reason);
        setResult({ ...r, sentForApproval: r.status === "pending" });
      } else {
        setResult(await recordStockMovements(requestId, date, toSave));
      }
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
    <div className="-m-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1">
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
          onConfirm={(recipe) => void confirm(recipe)}
        />
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          startReview();
        }}
      >
        <Section
          title={canEdit ? "Add to stock journal" : "Stock journal"}
          description={canEdit ? "Stock in, out or production" : "What was recorded each day"}
          action={
            <>
              {date !== today ? (
                <Button variant="ghost" onClick={() => setDate(today)}>
                  Back to today
                </Button>
              ) : null}
              <Input
                aria-label="Journal date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="w-40"
              />
            </>
          }
        >
          {canEdit ? (
            <>
              <div className={clsx(LINE_GRID, "h-10 items-center border-b border-line text-label font-medium text-ink-muted")}>
                <span>Item</span>
                <span>Type</span>
                <span>Quantity</span>
                <span>Reason</span>
                <span />
              </div>
              {lines.map((l, i) => {
                const KindIcon = KIND_ICON[l.kind];
                const optional = l.kind === "OPENING" || (l.kind === "IN" && l.item !== null && isMade(l.item));
                return (
                  <div key={l.key} className="border-b border-line-row py-1.5">
                    <div className={clsx(LINE_GRID, "items-center")}>
                      <ItemPicker
                        items={items}
                        value={l.item}
                        onChange={(item) => update(l.key, { item })}
                        autoFocus={i > 0 && i === lines.length - 1}
                        chevron
                      />
                      <div className="relative">
                        <Select
                          value={l.kind}
                          onChange={(e) => update(l.key, { kind: e.target.value as LineKind })}
                          aria-label="Type"
                          className="[&_select]:pl-8"
                        >
                          {KIND_OPTIONS.map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </Select>
                        <KindIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
                      </div>
                      <div className="flex">
                        <Input
                          value={l.qty}
                          onChange={(e) => update(l.key, { qty: e.target.value })}
                          inputMode="decimal"
                          placeholder="0"
                          className="num min-w-0 flex-1 [&_input]:rounded-r-none"
                          aria-label="Quantity"
                        />
                        <span className="inline-flex h-8 min-w-10 items-center justify-center rounded-r-control border border-l-0 border-line-strong bg-surface-alt px-2.5 text-label text-ink-muted">
                          {l.item?.unitSet ? unitWord(l.item.baseUnit) : "—"}
                        </span>
                      </div>
                      <Input
                        value={l.note}
                        onChange={(e) => update(l.key, { note: e.target.value })}
                        placeholder={optional ? "Optional" : "Add a reason…"}
                        maxLength={200}
                        aria-label="Reason"
                      />
                      <IconButton
                        label="Remove line"
                        disabled={lines.length === 1}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                    {errors[l.key] ? <p className="mt-1 text-caption text-danger">{errors[l.key]}</p> : null}
                  </div>
                );
              })}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button icon={<Plus />} onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                  Add another line
                </Button>
                <div className="flex-1" />
                {saveError ? (
                  <p role="alert" className="text-label text-danger">
                    {saveError}
                  </p>
                ) : null}
                <Button type="submit" variant="primary" loading={busy} icon={<Check />}>
                  Review
                </Button>
              </div>
              {result ? <ResultNote result={result} /> : null}
            </>
          ) : null}
        </Section>
      </form>

      <Section
        title={
          <>
            {date === today ? "Today" : shortDate(date)}
            {recordedCount ? <span className="num font-normal text-ink-muted">{` · ${recordedCount.toLocaleString("en-IN")}`}</span> : null}
          </>
        }
      >
        <div className="overflow-x-auto">
          <MovementTable state={recorded} canEdit={canEdit} showDate={false} emptyText="Nothing recorded yet." />
        </div>
      </Section>
    </div>
  );
}

function ResultNote({ result }: { result: RecordResult & { sentForApproval?: boolean } }) {
  if (result.sentForApproval) {
    return (
      <Banner tone="info" className="mt-4">
        Sent to the Admin for approval — stock changes once the new recipe is approved.
      </Banner>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      <Banner tone={result.recorded > 0 ? "success" : "info"}>
        {result.alreadyRecorded
          ? "Already saved."
          : `Saved ${result.recorded} ${result.recorded === 1 ? "line" : "lines"}.`}
        {result.skipped.length > 0 ? ` ${result.skipped.length} unchanged (count already matched).` : ""}
      </Banner>
      {result.belowZero.map((b) => (
        <Banner key={b.itemId} tone="warning">
          {b.name} is now below zero — count it and correct.
        </Banner>
      ))}
    </div>
  );
}
