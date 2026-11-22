import { Boxes } from "lucide-react";
import { useMemo, useState } from "react";
import { formatINR, formatQuantity, milliCsv, paiseCsv, toCsv } from "@technofluid/core";
import { Badge, EmptyState, FilterPill, FilterSelect, SearchInput, StatTiles, Table, Td, Th, Tr } from "@/components/ui";
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
    <>
      <ReportBar asOf={state.status === "ready" ? state.asOf : null} loading={state.status === "loading"} onRefresh={refresh} csv={csv}>
        {r ? (
          <>
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder="Item name" className="w-64" aria-label="Search" />
            <FilterSelect label="Kind" value={kind} onChange={(v) => setKind(v as ItemKind | "")} options={[["", "All kinds"], ...(Object.keys(KIND_LABEL) as ItemKind[]).map((k): [string, string] => [k, KIND_LABEL[k]])]} />
            <FilterPill active={showEmpty} onClick={() => setShowEmpty(!showEmpty)}>
              Show items with nothing in stock ({emptyCount})
            </FilterPill>
          </>
        ) : null}
      </ReportBar>
      <NotReady state={state} onRetry={refresh} />
      {r ? (
        <>
          <StatTiles>
            <Stat label="Stock value (ex-GST)" value={formatINR(r.totalPaise)} hint="Average purchase price × on hand" />
            <Stat label="In stock, no cost yet" value={String(noCostInStock)} tone={noCostInStock ? "warning" : undefined} hint="Not in the total — never bought on a bill" />
            <Stat label="Below zero" value={String(r.belowZeroCount)} tone={r.belowZeroCount ? "warning" : undefined} hint="Not in the total" />
          </StatTiles>

          {rows.length === 0 ? (
            <EmptyState icon={<Boxes />} title="No item matches">
              Try other words, another kind, or show items with nothing in stock.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Kind</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Average price</Th>
                  <Th align="right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <Tr key={x.id}>
                    <Td>{x.name}</Td>
                    <Td muted>{KIND_LABEL[x.kind as ItemKind] ?? x.kind}</Td>
                    <Td num className="whitespace-nowrap">
                      {formatQuantity(x.onHandMilli, x.baseUnit)}
                    </Td>
                    <Td num className="whitespace-nowrap">
                      {x.avgPricePaise === null ? "—" : `${formatINR(x.avgPricePaise)}${PER_UNIT[x.baseUnit]}`}
                    </Td>
                    <Td num className="whitespace-nowrap">
                      {x.state === "valued" ? formatINR(x.valuePaise ?? 0) : <Badge tone={x.state === "belowZero" ? "danger" : "warning"}>{STATE_TEXT[x.state]}</Badge>}
                    </Td>
                  </Tr>
                ))}
                <Tr>
                  <Td colSpan={4} className="border-b-0 font-semibold">
                    {search || kind ? "Total of these items" : "Total"}
                  </Td>
                  <Td num className="border-b-0 font-semibold">
                    {formatINR(rows.reduce((sum, x) => sum + (x.valuePaise ?? 0), 0))}
                  </Td>
                </Tr>
              </tbody>
            </Table>
          )}
          <p className="mt-4 max-w-4xl text-caption text-ink-subtle">
            Cost is the bill's value before GST; freight isn't spread over items yet. Items made in-house get a value once production costing exists. As of now only — not as of a past date.
          </p>
        </>
      ) : null}
    </>
  );
}
