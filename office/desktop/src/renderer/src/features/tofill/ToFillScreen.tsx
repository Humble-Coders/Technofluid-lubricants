import { ClipboardCheck, Undo2 } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { formatINR, GAP_QUESTIONS, rupeesToPaise, type DataGap, type GapAction, type GapSection } from "@technofluid/core";
import { Badge, Banner, Button, EmptyState, ErrorState, Input, LoadingState, MoneyInput, Page, PageHeader, SearchInput, Segmented, Select, Tabs } from "@/components/ui";
import { useDataGaps } from "@/hooks/useDataGaps";
import { resolveDataGap } from "@/services/dataGapService";
import { PRICE_PER_OPTIONS } from "@/services/priceService";
import { editProduct, GST_SLABS, setProductsTax } from "@/services/productEditService";
import type { Product } from "@/services/productService";
import { saveStockItem, type StockItem } from "@/services/stockService";

const SECTIONS: { key: GapSection; label: string; help: string }[] = [
  { key: "price", label: "Prices", help: "Dealer and distributor price for each pack. If a pack isn't sold, mark it Not needed." },
  { key: "hsn", label: "GST & HSN", help: "One HSN code and GST % for each product (all its packs). GST is 18% everywhere until the CA confirms." },
  { key: "density", label: "Density", help: "Kilograms per litre, for products sold by the litre. Needed to turn litres into kg." },
  { key: "unit", label: "Stock units", help: "How each item is counted: litres, kg or pieces. No stock can be recorded for an item until this is set." },
  { key: "itemDensity", label: "Material density", help: "Kilograms per litre for liquid raw materials, premixes and blends. Needed when a recipe mixes litres and kg." },
  { key: "code", label: "Recipe codes", help: "Ingredients written in recipes that aren't in the stock list. Add each as a raw material, or say which existing item it is." },
  { key: "recipe", label: "No recipe", help: "Products without a recipe. Add it on the product, or mark Not needed if the product is bought in ready-made." },
  { key: "question", label: "Questions", help: "Things only you can answer. The answers decide how the app works out stock for production." },
  { key: "old", label: "Old products", help: "Products from the old list that aren't in the cleaned product master. Say whether to keep or remove each; removal is done later, after a check of the website." },
];

/** False until the server can store decisions (not needed / answers / keep-remove). */
const DecisionsOk = createContext(true);

const NOT_NEEDED_LABEL: Partial<Record<GapSection, string>> = { recipe: "Not needed (bought in)" };
const when = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/**
 * Admin → To fill in: everything in the product master only Gaurav can give — prices,
 * HSN, densities, units, unknown recipe codes, missing recipes, questions and the old
 * products. Each row saves straight to the product or stock item, so the app uses it at
 * once and the row disappears. What isn't needed can be marked so and undone later.
 */
export function ToFillScreen() {
  const state = useDataGaps();
  const [section, setSection] = useState<GapSection>("price");
  const [show, setShow] = useState<"todo" | "done">("todo");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c = {} as Record<GapSection, { todo: number; done: number }>;
    for (const s of SECTIONS) c[s.key] = { todo: 0, done: 0 };
    if (state.status === "ready") for (const g of state.data.gaps) c[g.section][g.done ? "done" : "todo"] += 1;
    return c;
  }, [state]);

  if (state.status === "loading") return <LoadingState label="Checking the product master…" />;
  if (state.status === "error") return <ErrorState title="Couldn't load what's missing">{state.message}</ErrorState>;
  const { gaps, products, items, decisionsAvailable } = state.data;
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const byId = new Map(items.map((i) => [i.id, i]));
  const materials = items.filter((i) => i.kind !== "product_pool").sort((a, b) => a.name.localeCompare(b.name));
  const totalTodo = SECTIONS.reduce((s, x) => s + counts[x.key].todo, 0);
  const info = SECTIONS.find((s) => s.key === section)!;
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = gaps.filter(
    (g) => g.section === section && g.done === (show === "done") && words.every((w) => `${g.title} ${g.detail} ${g.usedBy.join(" ")} ${g.skus.join(" ")}`.toLowerCase().includes(w)),
  );

  return (
    <Page>
      <PageHeader
        title="To fill in"
        subtitle="Details missing from the product master. Fill them in here and the app uses them straight away."
        badge={totalTodo > 0 ? <Badge tone="warning">{totalTodo} to do</Badge> : <Badge tone="success">All done</Badge>}
      />
      {decisionsAvailable ? null : (
        <Banner tone="warning" className="mb-4" title="Not needed, answers and keep/remove aren't switched on yet">
          The server still needs an update for these. Everything else (prices, HSN, units, densities, recipe codes) can be filled in now.
        </Banner>
      )}
      <Tabs value={section} onChange={setSection} options={SECTIONS.map((s) => [s.key, s.label, counts[s.key].todo])} className="overflow-x-auto" />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-label text-ink-muted">{info.help}</p>
        <Segmented
          value={show}
          onChange={setShow}
          options={[
            ["todo", `To do (${counts[section].todo})`],
            ["done", `Done (${counts[section].done})`],
          ]}
        />
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder="Search" className="w-52" aria-label="Search" />
      </div>

      <div className="mt-4">
        {shown.length === 0 ? (
          <EmptyState icon={<ClipboardCheck />} title={words.length ? "Nothing matches" : show === "todo" ? "Nothing to fill in here" : "Nothing marked done yet"}>
            {show === "todo" && !words.length ? "Everything in this list is filled in or marked." : null}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line-row border-y border-line-row">
            <DecisionsOk.Provider value={decisionsAvailable}>
              {shown.slice(0, 200).map((g) => (
                <li key={g.id} className="py-3">
                  <GapRow gap={g} bySku={bySku} byId={byId} materials={materials} />
                </li>
              ))}
            </DecisionsOk.Provider>
          </ul>
        )}
        {shown.length > 200 ? <p className="mt-3 text-label text-ink-muted">Showing the first 200 of {shown.length}. Search to find others.</p> : null}
      </div>
    </Page>
  );
}

function GapRow({ gap, bySku, byId, materials }: { gap: DataGap; bySku: Map<string, Product>; byId: Map<string, StockItem>; materials: StockItem[] }) {
  const products = gap.skus.map((s) => bySku.get(s)).filter((p): p is Product => Boolean(p));
  const item = gap.itemId ? (byId.get(gap.itemId) ?? null) : null;
  const head = (
    <div className="min-w-0">
      <div className="text-body font-medium text-ink">{gap.title}</div>
      <div className="text-label text-ink-muted">{gap.detail}</div>
      {gap.usedBy.length ? <div className="mt-0.5 text-label text-ink-muted">{gap.usedBy.slice(0, 6).join(" · ") + (gap.usedBy.length > 6 ? ` · and ${gap.usedBy.length - 6} more` : "")}</div> : null}
    </div>
  );
  if (gap.done) return <DoneRow gap={gap}>{head}</DoneRow>;
  switch (gap.section) {
    case "price":
      return products[0] ? <PriceRow gap={gap} product={products[0]} head={head} /> : head;
    case "hsn":
      return <HsnRow gap={gap} products={products} head={head} />;
    case "density":
      return <DensityRow gap={gap} products={products} head={head} />;
    case "unit":
    case "itemDensity":
      return item ? <ItemRow gap={gap} item={item} head={head} /> : head;
    case "code":
      return <CodeRow gap={gap} materials={materials} head={head} />;
    case "recipe":
      return <RecipeRow gap={gap} sku={gap.skus[0] ?? ""} head={head} />;
    case "question":
      return <QuestionRow gap={gap} head={head} />;
    case "old":
      return <OldRow gap={gap} product={products[0] ?? null} head={head} />;
  }
}

/** Saving state shared by the rows: busy flag, error text, and a runner. */
function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/** Title on the left; fields, Save and Not needed on the right; error under it. */
function RowLayout({ head, fields, onSave, saveDisabled, gap, save }: { head: ReactNode; fields: ReactNode; onSave?: () => void; saveDisabled?: boolean; gap: DataGap; save: ReturnType<typeof useSave> }) {
  return (
    <div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-56 flex-1">{head}</div>
        <div className="flex flex-wrap items-center gap-2">
          {fields}
          {onSave ? (
            <Button size="sm" variant="primary" loading={save.busy} disabled={saveDisabled} onClick={onSave}>
              Save
            </Button>
          ) : null}
          <NotNeededButton gap={gap} save={save} />
        </div>
      </div>
      {save.error ? <p className="mt-1.5 text-label text-danger">{save.error}</p> : null}
    </div>
  );
}

function NotNeededButton({ gap, save }: { gap: DataGap; save: ReturnType<typeof useSave> }) {
  const ok = useContext(DecisionsOk);
  if (gap.section === "question" || gap.section === "old") return null;
  return (
    <Button size="sm" variant="ghost" disabled={save.busy || !ok} onClick={() => void save.run(() => resolveDataGap(gap.id, "notNeeded"))} title="Leave it empty; it won't be asked again">
      {NOT_NEEDED_LABEL[gap.section] ?? "Not needed"}
    </Button>
  );
}

function DoneRow({ gap, children }: { gap: DataGap; children: ReactNode }) {
  const save = useSave();
  const d = gap.decision!;
  const label: Record<GapAction, string> = { notNeeded: "Not needed", answer: "Answered", keep: "Keep", remove: "Remove" };
  return (
    <div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-56 flex-1">
          {children}
          {d.value ? <p className="mt-1 text-body text-ink">“{d.value}”</p> : null}
          {d.note ? <p className="mt-0.5 text-label text-ink-muted">Note: {d.note}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={d.action === "remove" ? "warning" : "neutral"}>{label[d.action]}</Badge>
          <span className="text-label text-ink-muted">
            {d.byName}
            {d.at ? `, ${when(d.at)}` : ""}
          </span>
          <Button size="sm" variant="ghost" icon={<Undo2 />} loading={save.busy} onClick={() => void save.run(() => resolveDataGap(gap.id, "reopen"))}>
            {gap.section === "question" ? "Change" : "Undo"}
          </Button>
        </div>
      </div>
      {save.error ? <p className="mt-1.5 text-label text-danger">{save.error}</p> : null}
    </div>
  );
}

/** "1,250.50" → paise; "" → null; anything else → NaN (shown as invalid). */
function paiseOf(text: string): number | null {
  if (!text.trim()) return null;
  try {
    const p = rupeesToPaise(text);
    return p > 0 ? p : Number.NaN;
  } catch {
    return Number.NaN;
  }
}
const rupees = (p: number | null) => (p === null ? "" : formatINR(p, { symbol: false }));

function PriceRow({ gap, product, head }: { gap: DataGap; product: Product; head: ReactNode }) {
  const save = useSave();
  const [per, setPer] = useState(product.pricePer ?? "");
  const [dealer, setDealer] = useState(rupees(product.dealerPricePaise));
  const [dist, setDist] = useState(rupees(product.distributorPricePaise));
  const d = paiseOf(dealer);
  const t = paiseOf(dist);
  const invalid = Number.isNaN(d) || Number.isNaN(t);
  const nothing = (d === null || d === product.dealerPricePaise) && (t === null || t === product.distributorPricePaise) && per === (product.pricePer ?? "");
  return (
    <RowLayout
      gap={gap}
      save={save}
      head={head}
      saveDisabled={invalid || nothing || !per}
      onSave={() =>
        void save.run(() =>
          editProduct(product.sku, {
            ...(per !== (product.pricePer ?? "") ? { pricePer: per } : {}),
            ...(d !== null && d !== product.dealerPricePaise ? { dealerPrice: d } : {}),
            ...(t !== null && t !== product.distributorPricePaise ? { distributorPrice: t } : {}),
          }),
        )
      }
      fields={
        <>
          <Select value={per} onChange={(e) => setPer(e.target.value)} aria-label="Price per" className="w-32">
            <option value="">Price per…</option>
            {PRICE_PER_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
          <MoneyInput value={dealer} onChange={(e) => setDealer(e.target.value)} invalid={Number.isNaN(d)} placeholder="Dealer" aria-label="Dealer price" className="w-28" />
          <MoneyInput value={dist} onChange={(e) => setDist(e.target.value)} invalid={Number.isNaN(t)} placeholder="Distributor" aria-label="Distributor price" className="w-28" />
        </>
      }
    />
  );
}

function HsnRow({ gap, products, head }: { gap: DataGap; products: Product[]; head: ReactNode }) {
  const save = useSave();
  const [gst, setGst] = useState(String(products[0]?.gstPct ?? 18));
  const [hsn, setHsn] = useState(products.find((p) => p.hsnCode)?.hsnCode ?? "");
  const valid = /^(\d{4}|\d{6}|\d{8})$/.test(hsn.trim());
  return (
    <RowLayout
      gap={gap}
      save={save}
      head={head}
      saveDisabled={!valid}
      onSave={() => void save.run(() => setProductsTax(gap.skus, { gstPct: Number(gst), hsnCode: hsn.trim() }, "To fill in"))}
      fields={
        <>
          <Select value={gst} onChange={(e) => setGst(e.target.value)} aria-label="GST %" className="w-24">
            {GST_SLABS.map((s) => (
              <option key={s} value={String(s)}>
                GST {s}%
              </option>
            ))}
          </Select>
          <Input value={hsn} onChange={(e) => setHsn(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="HSN (4, 6 or 8 digits)" aria-label="HSN code" className="w-44" invalid={hsn !== "" && !valid} />
        </>
      }
    />
  );
}

/** "0.87" → 0.87 when 0.3–3, null when empty, NaN otherwise. */
function densityOf(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0.3 && n <= 3 ? n : Number.NaN;
}

function DensityRow({ gap, products, head }: { gap: DataGap; products: Product[]; head: ReactNode }) {
  const save = useSave();
  const [text, setText] = useState(String(products.find((p) => p.densityKgPerL !== null)?.densityKgPerL ?? ""));
  const d = densityOf(text);
  return (
    <RowLayout
      gap={gap}
      save={save}
      head={head}
      saveDisabled={d === null || Number.isNaN(d)}
      onSave={() =>
        void save.run(async () => {
          // Every pack of the product shares the density.
          for (const p of products.filter((x) => x.densityKgPerL !== d)) await editProduct(p.sku, { densityKgPerL: d });
        })
      }
      fields={<Input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" placeholder="kg per litre, e.g. 0.87" aria-label="Density" className="w-44" invalid={Number.isNaN(d)} />}
    />
  );
}

function ItemRow({ gap, item, head }: { gap: DataGap; item: StockItem; head: ReactNode }) {
  const save = useSave();
  const [unit, setUnit] = useState<"" | "L" | "kg" | "piece">(item.unitSet ? item.baseUnit : "");
  const [text, setText] = useState(item.densityKgPerL === null ? "" : String(item.densityKgPerL));
  const d = densityOf(text);
  const needsUnit = gap.section === "unit";
  const showDensity = item.kind !== "consumable" && unit !== "piece";
  return (
    <RowLayout
      gap={gap}
      save={save}
      head={head}
      saveDisabled={!unit || Number.isNaN(d) || (!needsUnit && d === null)}
      onSave={() =>
        void save.run(() =>
          saveStockItem({
            itemId: item.id,
            name: item.name,
            code: item.code,
            baseUnit: unit || null,
            densityKgPerL: showDensity ? d : item.densityKgPerL,
            aliases: item.aliases,
            ...(item.stockMode ? { stockMode: item.stockMode } : {}),
          }),
        )
      }
      fields={
        <>
          {needsUnit ? (
            <Select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} aria-label="Unit" className="w-32">
              <option value="">Unit…</option>
              <option value="L">Litres (L)</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="piece">Pieces</option>
            </Select>
          ) : null}
          {showDensity ? (
            <Input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" placeholder={needsUnit ? "Density (optional)" : "kg per litre"} aria-label="Density" className="w-40" invalid={Number.isNaN(d)} />
          ) : null}
        </>
      }
    />
  );
}

function CodeRow({ gap, materials, head }: { gap: DataGap; materials: StockItem[]; head: ReactNode }) {
  const save = useSave();
  const [mode, setMode] = useState<"new" | "same">("new");
  const [name, setName] = useState(gap.title);
  const [unit, setUnit] = useState<"" | "L" | "kg">("");
  const [text, setText] = useState("");
  const [sameId, setSameId] = useState("");
  const d = densityOf(text);
  const same = materials.find((m) => m.id === sameId) ?? null;
  const ok = mode === "new" ? Boolean(name.trim() && unit && !Number.isNaN(d)) : Boolean(same);
  return (
    <RowLayout
      gap={gap}
      save={save}
      head={head}
      saveDisabled={!ok}
      onSave={() =>
        void save.run(() =>
          mode === "new"
            ? saveStockItem({ kind: "raw_material", name: name.trim(), code: gap.title, baseUnit: unit || null, densityKgPerL: d })
            : saveStockItem({
                itemId: same!.id,
                name: same!.name,
                code: same!.code,
                baseUnit: same!.unitSet ? same!.baseUnit : null,
                densityKgPerL: same!.densityKgPerL,
                aliases: [...same!.aliases, gap.title],
                ...(same!.stockMode ? { stockMode: same!.stockMode } : {}),
              }),
        )
      }
      fields={
        <>
          <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="What it is" className="w-48">
            <option value="new">Add as a raw material</option>
            <option value="same">It's an item we have</option>
          </Select>
          {mode === "new" ? (
            <>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className="w-40" />
              <Select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} aria-label="Unit" className="w-24">
                <option value="">Unit…</option>
                <option value="L">L</option>
                <option value="kg">kg</option>
              </Select>
              <Input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" placeholder="Density" aria-label="Density" className="w-24" invalid={Number.isNaN(d)} />
            </>
          ) : (
            <Select value={sameId} onChange={(e) => setSameId(e.target.value)} aria-label="Which item" className="w-56">
              <option value="">Pick the item…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.code && m.code !== m.name ? ` (${m.code})` : ""}
                </option>
              ))}
            </Select>
          )}
        </>
      }
    />
  );
}

function RecipeRow({ gap, sku, head }: { gap: DataGap; sku: string; head: ReactNode }) {
  const save = useSave();
  return (
    <RowLayout
      gap={gap}
      save={save}
      head={head}
      fields={
        <Link to={`/products?sku=${encodeURIComponent(sku)}`} className="text-label font-medium text-accent underline-offset-2 hover:underline">
          Add the recipe on the product
        </Link>
      }
    />
  );
}

function QuestionRow({ gap, head }: { gap: DataGap; head: ReactNode }) {
  const save = useSave();
  const ok = useContext(DecisionsOk);
  const q = GAP_QUESTIONS.find((x) => `question:${x.key}` === gap.id);
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState("");
  const answer = choice === "other" ? other.trim() : choice;
  return (
    <div>
      {head}
      <div className="mt-2 flex flex-col gap-1.5">
        {[...(q?.choices ?? []), "other"].map((c) => (
          <label key={c} className="flex items-center gap-2 text-body text-ink">
            <input type="radio" name={gap.id} value={c} checked={choice === c} onChange={() => setChoice(c)} className="accent-accent" />
            {c === "other" ? "Something else:" : c}
            {c === "other" ? <Input value={other} onChange={(e) => setOther(e.target.value)} onFocus={() => setChoice("other")} placeholder="Write the answer" aria-label="Other answer" className="w-80" maxLength={500} /> : null}
          </label>
        ))}
        <div>
          <Button size="sm" variant="primary" loading={save.busy} disabled={!answer || !ok} onClick={() => void save.run(() => resolveDataGap(gap.id, "answer", { value: answer }))}>
            Save answer
          </Button>
        </div>
      </div>
      {save.error ? <p className="mt-1.5 text-label text-danger">{save.error}</p> : null}
    </div>
  );
}

function OldRow({ gap, product, head }: { gap: DataGap; product: Product | null; head: ReactNode }) {
  const save = useSave();
  const [note, setNote] = useState("");
  const ok = useContext(DecisionsOk);
  const decide = (action: "keep" | "remove") => void save.run(() => resolveDataGap(gap.id, action, note.trim() ? { note: note.trim() } : {}));
  return (
    <div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-56 flex-1">
          {head}
          {product && product.dealerPricePaise !== null ? <div className="text-label text-ink-muted">Dealer price {formatINR(product.dealerPricePaise)}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. renamed to…" aria-label="Note" className="w-60" maxLength={300} />
          <Button size="sm" disabled={save.busy || !ok} onClick={() => decide("keep")}>
            Keep
          </Button>
          <Button size="sm" variant="danger" disabled={save.busy || !ok} onClick={() => decide("remove")}>
            Remove
          </Button>
        </div>
      </div>
      {save.error ? <p className="mt-1.5 text-label text-danger">{save.error}</p> : null}
    </div>
  );
}
