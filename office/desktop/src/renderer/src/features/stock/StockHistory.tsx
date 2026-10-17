import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { indiaDate } from "@technofluid/core";
import { Button, Input, Select } from "@/components/ui";
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-2.5">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearch("")}
          placeholder="Search item, reason or person"
          leading={<Search className="size-3.5" />}
          className="w-[240px]"
          aria-label="Search stock history"
        />
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type of line" className="w-40">
          <option value="all">All types</option>
          {(Object.keys(TYPE_LABEL) as MovementType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind of item" className="w-40">
          <option value="all">All items</option>
          {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}s
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span>From</span>
          <Input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="w-36" />
          <span>to</span>
          <Input type="date" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="w-36" />
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-ink">
          <input
            type="checkbox"
            checked={hideUndone}
            onChange={(e) => setHideUndone(e.target.checked)}
            className="size-3.5 accent-brand-orange"
          />
          Hide undone lines
        </label>
        {anyFilter ? (
          <Button size="sm" variant="ghost" onClick={clear} icon={<X className="size-3.5" />}>
            Clear filters
          </Button>
        ) : null}
        <div className="flex-1" />
        <span className="num text-[12px] text-ink-muted">
          {filtered.status === "ready"
            ? `${filtered.data.length.toLocaleString("en-IN")} ${filtered.data.length === 1 ? "line" : "lines"}`
            : ""}
          {dated ? "" : ` · latest ${LATEST}`}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <MovementTable
          state={filtered}
          canEdit={canEdit}
          emptyText={anyFilter ? "No stock lines match these filters." : "No stock recorded yet."}
        />
      </div>
    </div>
  );
}
