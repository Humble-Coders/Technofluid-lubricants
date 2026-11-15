import { Boxes, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatINR, formatQuantity, milliCsv, paiseCsv, toCsv } from "@technofluid/core";
import { Badge, EmptyState, Input, Select, Switch } from "@/components/ui";
import { KIND_LABEL } from "@/features/stock/stockFormat";
import { useStockValueReport } from "@/hooks/useReports";
import type { ItemKind } from "@/services/stockService";
import { fileDay, NotReady, PER_UNIT, ReportBar, Stat } from "./reportParts";

const STATE_TEXT = { valued: "", noCost: "No cost yet", belowZero: "Below zero" } as const;

/**
 * Stock value (as of now): on hand × the weighted average purchase price (ex-GST) over
 * every active bill. Items never bought (made in-house, or not yet billed) show their
 * quantity with "no cost yet"; below-zero items are flagged; neither is in the total.
 */
export function StockValueReportView() {
  const { state, refresh } = useStockValueReport();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ItemKind | "">("");
  const [showEmpty, setShowEmpty] = useState(false);
  const r = state.status === "ready" ? state.data : null;

  const rows = useMemo(() => {
    if (!r) return [];
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return r.rows.filter((x) => (showEmpty || x.onHandMilli !== 0) && (!kind || x.kind === kind) && words.every((w) => x.name.toLowerCase().includes(w)));
  }, [r, search, kind, showEmpty]);
  const emptyCount = r ? r.rows.filter((x) => x.onHandMilli === 0).length : 0;
  const noCostInStock = r ? r.rows.filter((x) => x.state === "noCost" && x.onHandMilli > 0).length : 0;

  const csv = r
    ? () => {
        const out: (string | number | null)[][] = [["Item", "Kind", "Unit", "On hand", "Average purchase price per unit (ex-GST)", "Value", "Note"]];
        for (const x of r.rows) out.push([x.name, KIND_LABEL[x.kind as ItemKind] ?? x.kind, x.baseUnit, milliCsv(x.onHandMilli), x.avgPricePaise === null ? null : paiseCsv(x.avgPricePaise), x.valuePaise === null ? null : paiseCsv(x.valuePaise), STATE_TEXT[x.state] || null]);
        out.push(["Total", null, null, null, null, paiseCsv(r.totalPaise), `${r.noCostCount} with no cost yet, ${r.belowZeroCount} below zero (not counted)`]);
        return { fileName: `Stock value ${fileDay(state.status === "ready" ? state.asOf : new Date())}`, text: toCsv(out) };
      }
    : null;

  return (
    <div className="space-y-4 px-5 py-4">
      <ReportBar asOf={state.status === "ready" ? state.asOf : null} loading={state.status === "loading"} onRefresh={refresh} csv={csv} />
      <NotReady state={state} onRetry={refresh} />
      {r ? (
        <>
          <div className="flex flex-wrap gap-3">
            <Stat label="Stock value (ex-GST)" value={formatINR(r.totalPaise)} hint="Average purchase price × on hand" />
            <Stat label="In stock, no cost yet" value={String(noCostInStock)} tone={noCostInStock ? "warning" : undefined} hint="Not in the total — never bought on a bill" />
            <Stat label="Below zero" value={String(r.belowZeroCount)} tone={r.belowZeroCount ? "warning" : undefined} hint="Not in the total" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item name" leading={<Search className="size-3.5" />} className="w-64" aria-label="Search" />
            <Select value={kind} onChange={(e) => setKind(e.target.value as ItemKind | "")} aria-label="Kind" className="w-44">
              <option value="">All kinds</option>
              {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-[12px] text-ink-muted">
              <Switch checked={showEmpty} onChange={setShowEmpty} label="Show items with nothing in stock" />
              Show items with nothing in stock ({emptyCount})
            </label>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={<Boxes className="size-6" />} title="No item matches">
              Try other words, another kind, or show items with nothing in stock.
            </EmptyState>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Kind</th>
                  <th className="py-2 pr-3 text-right font-medium">On hand</th>
                  <th className="py-2 pr-3 text-right font-medium">Average price</th>
                  <th className="py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} className="border-b border-line/70">
                    <td className="py-1.5 pr-3">{x.name}</td>
                    <td className="py-1.5 pr-3 text-ink-muted">{KIND_LABEL[x.kind as ItemKind] ?? x.kind}</td>
                    <td className="num py-1.5 pr-3 text-right whitespace-nowrap">{formatQuantity(x.onHandMilli, x.baseUnit)}</td>
                    <td className="num py-1.5 pr-3 text-right whitespace-nowrap">{x.avgPricePaise === null ? "—" : `${formatINR(x.avgPricePaise)}${PER_UNIT[x.baseUnit]}`}</td>
                    <td className="num py-1.5 text-right whitespace-nowrap">
                      {x.state === "valued" ? formatINR(x.valuePaise ?? 0) : <Badge tone={x.state === "belowZero" ? "danger" : "warning"}>{STATE_TEXT[x.state]}</Badge>}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3" colSpan={4}>
                    {search || kind ? "Total of these items" : "Total"}
                  </td>
                  <td className="num py-2 text-right">{formatINR(rows.reduce((sum, x) => sum + (x.valuePaise ?? 0), 0))}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="text-[12px] text-ink-faint">
            Cost is the bill's value before GST; freight isn't spread over items yet. Items made in-house get a value once production costing exists. As of now only — not as of a past date.
          </p>
        </>
      ) : null}
    </div>
  );
}
