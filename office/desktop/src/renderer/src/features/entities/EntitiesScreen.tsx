import clsx from "clsx";
import { AlertTriangle, Building2, CloudOff, Download, Link2, Plus, RefreshCw, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { formatINR, GST_STATES, type BalanceDirection } from "@technofluid/core";
import { Badge, Button, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { useEntities, useEntityBalances } from "@/hooks/useEntities";
import { retryEntitySync, type EntityRow } from "@/services/entityService";
import type { EntityBalance } from "@/services/ledgerService";
import { EntityDetail } from "./EntityDetail";
import { EntityForm } from "./EntityForm";
import { ImportDistributorsDialog } from "./ImportDistributorsDialog";

type Filter = "all" | "customer" | "supplier" | "archived" | "receivable" | "payable";
type Sort = "name" | "balance";

/**
 * Customers & suppliers (Admin, Accounts): everyone Technofluid deals with money-wise.
 * Profiles come from Firestore; balances from the books (Humble Ledger) — if the books
 * can't be reached the list still shows, balances show "—", and Retry really retries.
 */
export function EntitiesScreen() {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const entities = useEntities();
  const list = useMemo(() => (entities.status === "ready" ? entities.data : []), [entities]);
  // Re-fetch balances when the set of synced entities changes (a new opening balance etc.).
  const syncedKey = list.filter((e) => e.syncStatus === "SYNCED").map((e) => e.id).join(",");
  const books = useEntityBalances(syncedKey);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ entity: EntityRow | null } | null>(null);
  const [importing, setImporting] = useState(false);

  const balanceOf = (id: string): EntityBalance | null => books.balances?.[id] ?? null;
  const totals = useMemo(() => {
    let owed = 0;
    let owe = 0;
    for (const e of list) {
      const b = books.balances?.[e.id]?.balancePaise ?? 0;
      if (b > 0) owed += b;
      else owe += -b;
    }
    return { owed, owe };
  }, [list, books.balances]);

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const digits = search.replace(/\D/g, "");
    const shown = list.filter((e) => {
      if (filter === "archived" ? e.isActive : !e.isActive) return false;
      if (filter === "customer" && !e.kinds.includes("customer")) return false;
      if (filter === "supplier" && !e.kinds.includes("supplier")) return false;
      const b = books.balances?.[e.id]?.balancePaise ?? 0;
      if (filter === "receivable" && b <= 0) return false;
      if (filter === "payable" && b >= 0) return false;
      if (words.length === 0) return true;
      const hay = [e.name, e.gstin ?? "", e.address.city, ...e.phones].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w)) || (digits.length >= 4 && e.phones.some((p) => p.includes(digits)));
    });
    return sort === "name"
      ? shown
      : [...shown].sort((a, b) => Math.abs(books.balances?.[b.id]?.balancePaise ?? 0) - Math.abs(books.balances?.[a.id]?.balancePaise ?? 0));
  }, [list, search, filter, sort, books.balances]);
  const selected = list.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 space-y-3 bg-surface px-5 pt-4 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="They owe us"
              paise={books.balances ? totals.owed : null}
              tone="receivable"
              active={filter === "receivable"}
              onClick={() => setFilter(filter === "receivable" ? "all" : "receivable")}
            />
            <StatCard
              label="We owe them"
              paise={books.balances ? totals.owe : null}
              tone="payable"
              active={filter === "payable"}
              onClick={() => setFilter(filter === "payable" ? "all" : "payable")}
            />
          </div>

          {books.error ? (
            <div role="alert" className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
              <CloudOff className="size-4 shrink-0" />
              <span className="flex-1">Books unreachable — balances can't be shown right now. {books.error}</span>
              <Button size="sm" onClick={() => void books.retry()} loading={books.loading} icon={<RefreshCw className="size-3.5" />}>
                Retry
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearch("")}
              placeholder="Search name, phone or GSTIN"
              leading={<Search className="size-3.5" />}
              className="w-[260px]"
              aria-label="Search customers and suppliers"
            />
            <div className="inline-flex h-8 items-center rounded-md border border-line-strong bg-canvas p-0.5" role="radiogroup">
              {(
                [
                  ["all", "All"],
                  ["customer", "Customers"],
                  ["supplier", "Suppliers"],
                  ["archived", "Archived"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={filter === k}
                  onClick={() => setFilter(k)}
                  className={clsx("h-full rounded px-2.5 text-[12px] font-medium", filter === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
                >
                  {label}
                </button>
              ))}
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by" className="w-36">
              <option value="name">By name</option>
              <option value="balance">By balance</option>
            </Select>
            <div className="flex-1" />
            {isAdmin ? (
              <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => setImporting(true)}>
                Import website distributors
              </Button>
            ) : null}
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setForm({ entity: null })}>
              Add
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {entities.status === "loading" ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : entities.status === "error" ? (
            <EmptyState icon={<AlertTriangle className="size-6" />} title="Customers couldn't be loaded">
              {entities.message}
            </EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState icon={<Users className="size-6" />} title={list.length === 0 ? "No customers or suppliers yet" : "Nothing matches"}>
              {list.length === 0 ? "Add one, or (Admin) import the website's distributors." : "Try fewer words, or another filter."}
            </EmptyState>
          ) : (
            <ul>
              {rows.map((e) => (
                <EntityListRow
                  key={e.id}
                  entity={e}
                  balance={balanceOf(e.id)}
                  booksDown={Boolean(books.error) || books.balances === null}
                  selected={e.id === selectedId}
                  onSelect={() => setSelectedId(e.id === selectedId ? null : e.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {selected ? (
        <EntityDetail
          entity={selected}
          balance={balanceOf(selected.id)}
          booksError={books.error}
          onEdit={() => setForm({ entity: selected })}
          onClose={() => setSelectedId(null)}
          onChanged={() => void books.retry()}
        />
      ) : null}

      {form ? (
        <EntityForm
          entity={form.entity}
          all={list}
          onClose={(id) => {
            setForm(null);
            if (id) setSelectedId(id);
          }}
        />
      ) : null}
      {importing ? <ImportDistributorsDialog onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

function StatCard({
  label,
  paise,
  tone,
  active,
  onClick,
}: {
  label: string;
  paise: number | null;
  tone: "receivable" | "payable";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title="Show only these"
      className={clsx(
        "rounded-lg border px-4 py-3 text-left transition-colors",
        active ? (tone === "receivable" ? "border-success bg-success-soft" : "border-danger bg-danger-soft") : "border-line bg-surface hover:bg-hover",
      )}
    >
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={clsx("num text-[20px] font-semibold", tone === "receivable" ? "text-success" : "text-danger")}>
        {paise === null ? "—" : formatINR(paise)}
      </p>
    </button>
  );
}

export function BalanceText({ balance, className }: { balance: EntityBalance | null; className?: string }) {
  if (!balance) return <span className={clsx("num text-ink-faint", className)}>—</span>;
  const tone: Record<BalanceDirection, string> = { receivable: "text-success", payable: "text-danger", settled: "text-ink-faint" };
  return (
    <span className={clsx("num font-semibold", tone[balance.direction], className)}>
      {balance.direction === "settled" ? "Settled" : formatINR(Math.abs(balance.balancePaise))}
    </span>
  );
}

function EntityListRow({
  entity: e,
  balance,
  booksDown,
  selected,
  onSelect,
}: {
  entity: EntityRow;
  balance: EntityBalance | null;
  booksDown: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const state = e.address.stateCode ? GST_STATES[e.address.stateCode] : null;
  return (
    <li
      onClick={onSelect}
      className={clsx("flex cursor-default items-center gap-3 border-b border-line/70 px-5 py-2.5 text-[13px]", selected ? "bg-brand-orange/[0.08]" : "hover:bg-hover")}
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-muted">
        <Building2 className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate font-medium text-ink">{e.name}</span>
          {e.kinds.includes("customer") ? <Badge tone="info">Customer</Badge> : null}
          {e.kinds.includes("supplier") ? <Badge tone="brand">Supplier</Badge> : null}
          {e.distributorId ? <Link2 className="size-3.5 text-ink-faint" aria-label="Linked to a website distributor" /> : null}
          {!e.isActive ? <Badge>Archived</Badge> : null}
        </p>
        <p className="truncate text-[12px] text-ink-muted">
          {[e.address.city, state].filter(Boolean).join(" · ") || (e.address.stateCode ? "" : "State needed")}
        </p>
      </div>
      {e.syncStatus === "PENDING" ? (
        <Badge tone="neutral">Saving to books…</Badge>
      ) : e.syncStatus === "FAILED" ? (
        <span className="flex items-center gap-1" title={e.hlSyncError ?? undefined}>
          <Badge tone="danger">Couldn't save to books</Badge>
          <button
            type="button"
            className="text-[12px] font-medium text-info hover:underline disabled:opacity-50"
            disabled={retrying}
            onClick={(ev) => {
              ev.stopPropagation();
              setRetrying(true);
              void retryEntitySync(e.id).finally(() => setRetrying(false));
            }}
          >
            Retry
          </button>
        </span>
      ) : null}
      <span className="w-32 text-right">{booksDown ? <span className="num text-ink-faint">—</span> : <BalanceText balance={balance ?? (e.syncStatus === "SYNCED" ? { balancePaise: 0, direction: "settled" } : null)} />}</span>
    </li>
  );
}
