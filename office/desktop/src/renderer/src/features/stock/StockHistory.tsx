import { ClipboardList, X } from "lucide-react";
import { useMemo, useState } from "react";
import { indiaDate } from "@technofluid/core";
import { Button, EmptyState, FilterPill, FilterSelect, Input, SearchInput, TableFooter } from "@/components/ui";
import { useMovements } from "@/hooks/useStock";
import type { ItemKind, MovementType, StockMovement } from "@/services/stockService";
import { MovementTable } from "./MovementTable";
import { KIND_LABEL, TYPE_LABEL } from "./stockFormat";

const LATEST = 300;

/**
 * Every stock line, filterable. Without dates it shows the latest 300; with a date range it
 * loads that whole range (business dates) from the server. Other filters work on what's loaded.
 */
export function StockHistory({ canEdit }: { canEdit: boolean }) {
  const today = indiaDate();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | MovementType>("all");
  const [kind, setKind] = useState<"all" | ItemKind>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hideUndone, setHideUndone] = useState(false);

  const dated = Boolean(from || to);
  const state = useMovements(dated ? { from: from || "2000-01-01", to: to || today } : { latest: LATEST });

  const filtered = useMemo(() => {
    if (state.status !== "ready") return state;
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (m: StockMovement) =>
      (type === "all" || m.type === type) &&
      (kind === "all" || m.itemKind === kind) &&
      (!hideUndone || (!m.reversedById && m.type !== "REVERSAL")) &&
      words.every((w) => `${m.itemName} ${m.note ?? ""} ${m.byName}`.toLowerCase().includes(w));
    return { status: "ready" as const, data: state.data.filter(matches) };
  }, [state, search, type, kind, hideUndone]);

  const anyFilter = search || type !== "all" || kind !== "all" || dated || hideUndone;
  const clear = () => {
    setSearch("");
    setType("all");
    setKind("all");
    setFrom("");
    setTo("");
    setHideUndone(false);
  };

  const emptyText = anyFilter ? "No stock lines match these filters." : "No stock recorded yet.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearch("")}
          onClear={() => setSearch("")}
          placeholder="Search"
          className="w-64"
          aria-label="Search stock history"
        />
        <FilterSelect
          label="Type"
          value={type}
          onChange={(v) => setType(v as typeof type)}
          options={[["all", "All"], ...(Object.keys(TYPE_LABEL) as MovementType[]).map((t): [string, string] => [t, TYPE_LABEL[t]])]}
        />
        <FilterSelect
          label="Item"
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
          options={[["all", "All"], ...(Object.keys(KIND_LABEL) as ItemKind[]).map((k): [string, string] => [k, `${KIND_LABEL[k]}s`])]}
        />
        <Input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="w-36" />
        <span className="text-ink-muted">–</span>
        <Input type="date" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="w-36" />
        <FilterPill active={hideUndone} onClick={() => setHideUndone((v) => !v)}>
          Hide undone
        </FilterPill>
        {anyFilter ? (
          <Button variant="ghost" onClick={clear} icon={<X />}>
            Clear
          </Button>
        ) : null}
        <div className="flex-1" />
        {dated ? null : <span className="num text-label text-ink-muted">Latest {LATEST}</span>}
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-auto px-1">
        {filtered.status === "ready" && filtered.data.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title={emptyText} />
        ) : (
          <MovementTable state={filtered} canEdit={canEdit} emptyText={emptyText} />
        )}
      </div>
      {filtered.status === "ready" && state.status === "ready" && filtered.data.length > 0 ? (
        <TableFooter shown={filtered.data.length} total={state.data.length} noun={filtered.data.length === 1 ? "line" : "lines"} />
      ) : null}
    </div>
  );
}
