import clsx from "clsx";
import { Download, Link2, Plus, RefreshCw, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { formatINR, GST_STATES, type BalanceDirection } from "@technofluid/core";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  FilterSelect,
  LoadingState,
  Menu,
  Page,
  PageHeader,
  SearchInput,
  Segmented,
  StatTile,
  StatTiles,
  Table,
  TableFooter,
  Td,
  Th,
  Tr,
} from "@/components/ui";
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
    <>
      <Page fill>
        <PageHeader
          title="Customers & suppliers"
          actions={
            <>
              <Button variant={selected ? "secondary" : "primary"} icon={<Plus />} onClick={() => setForm({ entity: null })}>
                Add
              </Button>
              <Menu items={[isAdmin && { label: "Import website distributors", icon: <Download />, onSelect: () => setImporting(true) }]} />
            </>
          }
          toolbar={
            <>
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setSearch("")}
                onClear={() => setSearch("")}
                placeholder="Search name, phone or GSTIN"
                className="w-64"
                aria-label="Search customers and suppliers"
              />
              <Segmented<Filter>
                value={filter}
                onChange={setFilter}
                options={[
                  ["all", "All"],
                  ["customer", "Customers"],
                  ["supplier", "Suppliers"],
                  ["archived", "Archived"],
                ]}
              />
              <FilterSelect
                label="Sort by"
                value={sort}
                onChange={(v) => setSort(v as Sort)}
                options={[
                  ["name", "Name"],
                  ["balance", "Balance"],
                ]}
              />
            </>
          }
        />

        {books.error ? (
          <Banner
            tone="warning"
            className="mb-6 shrink-0"
            action={
              <Button size="sm" onClick={() => void books.retry()} loading={books.loading} icon={<RefreshCw />}>
                Retry
              </Button>
            }
          >
            Books unreachable, so balances can't be shown right now. {books.error}
          </Banner>
        ) : null}

        <StatTiles className="shrink-0">
          <div className="grid" title="Show only these">
            <StatTile
              label="They owe us"
              value={books.balances ? formatINR(totals.owed) : "-"}
              loading={books.balances === null && books.loading}
              active={filter === "receivable"}
              onClick={() => setFilter(filter === "receivable" ? "all" : "receivable")}
            />
          </div>
          <div className="grid" title="Show only these">
            <StatTile
              label="We owe them"
              value={books.balances ? formatINR(totals.owe) : "-"}
              loading={books.balances === null && books.loading}
              active={filter === "payable"}
              onClick={() => setFilter(filter === "payable" ? "all" : "payable")}
            />
          </div>
        </StatTiles>

        <div className="@container min-h-0 flex-1 overflow-auto">
          {entities.status === "loading" ? (
            <LoadingState />
          ) : entities.status === "error" ? (
            <ErrorState title="Customers couldn't be loaded">{entities.message}</ErrorState>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title={list.length === 0 ? "No customers or suppliers yet" : "Nothing matches"}
              action={list.length === 0 ? <Button onClick={() => setForm({ entity: null })}>Add</Button> : undefined}
            >
              {list.length === 0 ? "Add one, or (Admin) import the website's distributors." : "Try fewer words, or another filter."}
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th className="hidden @2xl:table-cell">Kind</Th>
                  <Th className="hidden @2xl:table-cell">Place</Th>
                  <Th align="right">Balance</Th>
                </tr>
              </thead>
              <tbody>
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
              </tbody>
            </Table>
          )}
        </div>
        {entities.status === "ready" && rows.length > 0 ? <TableFooter shown={rows.length} total={list.length} noun={list.length === 1 ? "name" : "names"} /> : null}
      </Page>

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
    </>
  );
}

export function BalanceText({ balance, className }: { balance: EntityBalance | null; className?: string }) {
  if (!balance) return <span className={clsx("num text-ink-faint", className)}>-</span>;
  const tone: Record<BalanceDirection, string> = { receivable: "font-semibold text-ink", payable: "font-semibold text-danger", settled: "text-ink-subtle" };
  return (
    <span className={clsx("num", tone[balance.direction], className)}>
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
  const kind = [e.kinds.includes("customer") ? "Customer" : null, e.kinds.includes("supplier") ? "Supplier" : null].filter(Boolean).join(" · ");
  const place = [e.address.city, state].filter(Boolean).join(" · ") || (e.address.stateCode ? null : <span className="text-warning">State needed</span>);
  const shown = balance ?? (e.syncStatus === "SYNCED" ? ({ balancePaise: 0, direction: "settled" } as const) : null);
  return (
    <Tr onOpen={onSelect} selected={selected}>
      <Td className="w-full max-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{e.name}</span>
          {e.distributorId ? <Link2 className="size-4 shrink-0 text-ink-subtle" aria-label="Linked to a website distributor" /> : null}
          {!e.isActive ? <Badge className="shrink-0">Archived</Badge> : null}
          {e.syncStatus === "PENDING" ? (
            <Badge tone="neutral" className="shrink-0">
              Saving to books…
            </Badge>
          ) : e.syncStatus === "FAILED" ? (
            <span className="flex shrink-0 items-center gap-1.5" title={e.hlSyncError ?? undefined}>
              <Badge tone="danger">Couldn't save to books</Badge>
              <Button
                size="sm"
                loading={retrying}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setRetrying(true);
                  void retryEntitySync(e.id).finally(() => setRetrying(false));
                }}
              >
                Retry
              </Button>
            </span>
          ) : null}
        </div>
        <p className="truncate text-label text-ink-muted @2xl:hidden">
          {kind}
          {kind && place ? " · " : null}
          {place}
        </p>
      </Td>
      <Td muted className="hidden whitespace-nowrap @2xl:table-cell">
        {kind}
      </Td>
      <Td muted className="hidden whitespace-nowrap @2xl:table-cell">
        {place}
      </Td>
      <Td num className="whitespace-nowrap">
        {booksDown ? (
          <span className="text-ink-faint">-</span>
        ) : (
          <>
            {shown?.direction === "payable" ? <span className="mr-2 text-caption text-danger">We owe</span> : null}
            <BalanceText balance={shown} />
          </>
        )}
      </Td>
    </Tr>
  );
}
