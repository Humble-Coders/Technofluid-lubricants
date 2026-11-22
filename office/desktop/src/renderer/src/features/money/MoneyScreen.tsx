import clsx from "clsx";
import { ArrowLeftRight, RefreshCw, Scale, Settings2, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { canReverse, formatINR, indiaDate, isCancelled, MONEY_CATEGORY_LABEL, moneyCategory, moneyDirection, reversalState, type MoneyAccountRef } from "@technofluid/core";
import {
  Badge,
  Banner,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FilterSelect,
  Input,
  LoadingState,
  Menu,
  PageHeader,
  SearchInput,
  Spinner,
  Switch,
  Table,
  TableFooter,
  tableClass,
  Td,
  Th,
  Tr,
  Workspace,
} from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { useEntities, useEntityBalances } from "@/hooks/useEntities";
import { useMoneyEntries, useMoneyEntry, useRegisterBalances, useRegisters } from "@/hooks/useMoney";
import { retryMoneyEntrySync, reverseMoneyEntry, type MoneyEntryRow } from "@/services/moneyService";
import { MoneyEntryPanel } from "./MoneyEntryPanel";
import { amountClass, amountSign, CorrectionDialog } from "./MoneyForms";
import { RegistersPanel } from "./RegistersPanel";

type Preset = "today" | "week" | "month" | "custom";

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function rangeFor(preset: Preset, today: string): [string, string] {
  if (preset === "today") return [today, today];
  if (preset === "week") return [addDays(today, -6), today];
  return [`${today.slice(0, 7)}-01`, today];
}

export const sideName = (r: MoneyAccountRef) => (r.kind === "ADJUSTMENT" ? "Adjustment" : r.name);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-02" → "2 Nov 2026" (always with the year). */
export function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  const month = MONTHS[Number(m) - 1];
  return y && month && d ? `${Number(d)} ${month} ${y}` : ymd;
}

type Sort = { key: "date" | "amount"; dir: "asc" | "desc" };

/** Everything a search can find in a row: both sides, the note, the bill / invoice and the amount (as typed or as shown). */
function haystack(e: MoneyEntryRow): string {
  const shown = formatINR(e.amountPaise);
  return [sideName(e.from), sideName(e.to), e.note ?? "", e.invoiceNo ?? "", e.purchaseRef ?? "", e.gst?.billNo ?? "", e.gst?.supplier.name ?? "", shown, shown.replace(/[₹,]/g, ""), String(e.amountPaise / 100)]
    .join(" ")
    .toLowerCase();
}

/**
 * Money in & out (Admin, Accounts), laid out like Aromex's Money workspace: every entry on the
 * left (search, dates, an accounting view that also shows reversals), and the record form
 * always open on the right, its pickers showing each account's balance from the books.
 * Nothing is edited or deleted: Reverse writes the mirror. Balances are refreshed only once
 * the entry just saved is in the books (never against a stale balance, Aromex #173).
 */
export function MoneyScreen() {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const canRecord = role === "admin" || role === "accounts";
  const today = indiaDate();
  const registers = useRegisters();
  const regs = useMemo(() => (registers.status === "ready" ? registers.data : []), [registers]);
  const realRegs = useMemo(() => regs.filter((r) => !r.placeholder), [regs]);
  const entities = useEntities();
  const parties = useMemo(() => (entities.status === "ready" ? entities.data : []), [entities]);
  const books = useRegisterBalances();
  const partyBooks = useEntityBalances(null);
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<[string, string]>(rangeFor("month", today));
  const [from, to] = preset === "custom" ? custom : rangeFor(preset, today);
  const entries = useMoneyEntries(from, to);
  const [search, setSearch] = useState("");
  const [accounting, setAccounting] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const [correcting, setCorrecting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const saved = useMoneyEntry(lastSaved);

  // Balances are refreshed only once the entry they depend on is in the books.
  useEffect(() => {
    if (saved?.syncStatus === "SYNCED") {
      void books.retry();
      void partyBooks.retry();
      setLastSaved(null);
    } else if (saved?.syncStatus === "FAILED") setLastSaved(null);
  }, [saved?.syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshing = books.loading || partyBooks.loading;
  const outOfDate = refreshing || saved?.syncStatus === "PENDING";
  const refresh = () => {
    void books.retry();
    void partyBooks.retry();
  };

  // Ctrl/⌘+R refreshes the balances (not the window).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        void books.retry();
        void partyBooks.retry();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [books.retry, partyBooks.retry]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing blanks: while other dates load, the last rows stay (with a spinner below); a
  // dropped live feed keeps them (for the same dates) under a banner.
  const kept = useRef<{ key: string; rows: MoneyEntryRow[] } | null>(null);
  const rangeKey = `${from}|${to}`;
  if (entries.status === "ready") kept.current = { key: rangeKey, rows: entries.data };
  const loaded =
    entries.status === "ready" ? entries.data : kept.current && (entries.status === "loading" || kept.current.key === rangeKey) ? kept.current.rows : null;

  const rows = useMemo(() => {
    if (!loaded) return [];
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = loaded.filter((e) => {
      // Normal view: a reversal that's in the books is hidden; its original shows struck through.
      if (!accounting && e.reversesEntryId && e.syncStatus === "SYNCED") return false;
      if (words.length === 0) return true;
      const text = haystack(e);
      return words.every((w) => text.includes(w) || text.includes(w.replace(/[₹,]/g, "")));
    });
    const sign = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) =>
      sort.key === "amount"
        ? sign * (a.amountPaise - b.amountPaise) || b.businessDay.localeCompare(a.businessDay)
        : sign * (a.businessDay.localeCompare(b.businessDay) || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
    );
  }, [loaded, search, accounting, sort]);

  const filtered = Boolean(search.trim()) || preset !== "month";
  const clear = () => {
    setSearch("");
    setPreset("month");
  };
  const toggleSort = (key: Sort["key"]) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const setupLoading = registers.status === "loading" || entities.status === "loading";
  const booksError = books.error ?? partyBooks.error;

  const left = (
    <div className="flex h-full min-h-0 flex-col px-6 pt-6 min-[1280px]:px-8">
      <PageHeader
        title="Money in & out"
        className="mb-4!"
        actions={
          <>
            <Button icon={<RefreshCw />} onClick={refresh} loading={refreshing} title="Refresh the balances (Ctrl+R)">
              {outOfDate ? "Updating…" : "Refresh"}
            </Button>
            <Menu
              items={[
                { label: "Cash & bank accounts", icon: <Settings2 />, onSelect: () => setManaging(true) },
                isAdmin ? { label: "Correct a balance", icon: <Scale />, onSelect: () => setCorrecting(true) } : null,
              ]}
            />
          </>
        }
      />

      {booksError ? (
        <Banner
          tone="warning"
          title="Books unreachable, so balances can't be shown right now."
          className="mb-4"
          action={
            <Button size="sm" onClick={refresh} loading={refreshing} icon={<RefreshCw />}>
              Retry
            </Button>
          }
        >
          {booksError}
        </Banner>
      ) : null}
      {registers.status === "error" || entities.status === "error" ? (
        <Banner tone="warning" className="mb-4" title="Accounts couldn't be loaded, so the pickers may be missing some.">
          {registers.status === "error" ? registers.message : entities.status === "error" ? entities.message : null}
        </Banner>
      ) : null}
      {entries.status === "error" && loaded ? (
        <Banner tone="warning" className="mb-4" title="Money stopped updating.">
          {entries.message}
        </Banner>
      ) : null}

      {/* One row that never wraps: on a narrow window the search shrinks and Clear / the switch shorten their words. */}
      <div className="@container/tb mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder="Search party, note or amount" aria-label="Search entries" className="w-72 min-w-20 shrink" />
          <FilterSelect
            label="Dates"
            value={preset}
            onChange={(v) => setPreset(v as Preset)}
            active={preset !== "month"}
            options={[
              ["today", "Today"],
              ["week", "Last 7 days"],
              ["month", "This month"],
              ["custom", "Custom…"],
            ]}
          />
          {filtered ? (
            <Button size="sm" variant="ghost" icon={<X />} onClick={clear} title="Clear the search and dates" aria-label="Clear">
              <span className="hidden @[34rem]/tb:inline">Clear</span>
            </Button>
          ) : null}
          <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 text-label font-medium whitespace-nowrap text-ink-muted">
            <Switch checked={accounting} onChange={setAccounting} label="Accounting view" />
            <span aria-hidden>
              Accounting<span className="hidden @[34rem]/tb:inline"> view</span>
            </span>
          </label>
        </div>
      </div>
      {preset === "custom" ? (
        <div className="-mt-2 mb-4 flex shrink-0 items-center gap-2">
          <Input type="date" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} aria-label="From" className="w-36" />
          <span className="text-ink-muted">to</span>
          <Input type="date" value={custom[1]} min={custom[0]} max={today} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} aria-label="To" className="w-36" />
        </div>
      ) : null}

      <div className="@container min-h-0 flex-1 overflow-auto">
        {!loaded && entries.status === "loading" ? (
          <LoadingState label="Loading money…" className="h-full" />
        ) : !loaded ? (
          <ErrorState title="Money couldn't be loaded">{entries.status === "error" ? entries.message : null}</ErrorState>
        ) : rows.length === 0 ? (
          filtered || loaded.length > 0 ? (
            <EmptyState icon={<ArrowLeftRight />} title="No entries match">
              Try a different search or date range.
            </EmptyState>
          ) : (
            <EmptyState icon={<ArrowLeftRight />} title="No money movements yet">
              Record money received, paid, or moved between accounts. It appears here.
            </EmptyState>
          )
        ) : (
          <MoneyTable rows={rows} isAdmin={isAdmin} canManage={canRecord} accounting={accounting} sort={sort} onSort={toggleSort} />
        )}
      </div>
      {loaded && (rows.length > 0 || entries.status === "loading") ? (
        <TableFooter shown={rows.length} noun={`${rows.length === 1 ? "entry" : "entries"}${filtered ? " found" : ""}`}>
          {entries.status === "loading" ? <Spinner /> : null}
        </TableFooter>
      ) : (
        <div className="h-4 shrink-0" />
      )}
    </div>
  );

  return (
    <>
      {setupLoading ? (
        <div className="h-full">{left}</div>
      ) : (
        <Workspace
          panel={
            <MoneyEntryPanel
              parties={parties}
              allEntities={parties}
              registers={realRegs}
              registerBalances={books.error ? null : books.balances}
              partyBalances={partyBooks.error ? null : partyBooks.balances}
              balancesLoading={refreshing}
              canRecord={canRecord}
              onRecorded={setLastSaved}
            />
          }
        >
          {left}
        </Workspace>
      )}
      {correcting ? (
        <CorrectionDialog
          parties={parties}
          registers={realRegs}
          partyBalances={partyBooks.balances}
          registerBalances={books.balances}
          onClose={(id) => {
            setCorrecting(false);
            if (id) setLastSaved(id);
          }}
        />
      ) : null}
      {managing ? <RegistersPanel registers={regs} balances={books.balances} canManage={isAdmin} onClose={() => setManaging(false)} /> : null}
    </>
  );
}

/** Why an entry can't be reversed (the menu item's tooltip), or null when it can. */
function cannotReverse(e: MoneyEntryRow, isAdmin: boolean): string | null {
  if (e.reversesEntryId) return "A reversal can't be reversed";
  if (e.reversedByEntryId) return "Already reversed";
  if (e.syncStatus !== "SYNCED") return "Can be reversed once it's in the books";
  if (e.isCorrection && !isAdmin) return "Only an admin can reverse a correction";
  return canReverse(e) ? null : "Can't be reversed";
}

/** The extras Technofluid keeps with an entry, shown after its note. */
function noteText(e: MoneyEntryRow): string {
  return [e.note, e.invoiceNo ? `Invoice ${e.invoiceNo}` : null, e.purchaseRef ? `Bill ${e.purchaseRef}` : null, e.gst ? `GST bill ${e.gst.billNo}` : null].filter(Boolean).join(" · ");
}

/**
 * The Money table (Aromex's columns): Date · Particulars ("From → To") · Notes · Amount · ⋯.
 * Direction is said by the amount alone: + green for money in, − for money out, no sign for
 * a move between our own accounts. Rows don't open; the only action is Reverse. Notes fold
 * away on a narrow window (the badges then sit after the particulars).
 */
function MoneyTable({
  rows,
  isAdmin,
  canManage,
  accounting,
  sort,
  onSort,
}: {
  rows: MoneyEntryRow[];
  isAdmin: boolean;
  canManage: boolean;
  accounting: boolean;
  sort: Sort;
  onSort: (key: Sort["key"]) => void;
}) {
  const [reversing, setReversing] = useState<MoneyEntryRow | null>(null);
  return (
    <>
      <table className={clsx(tableClass.table, "table-fixed")}>
        <thead>
          <tr>
            <Th className="w-[100px] @[30rem]:w-[116px]" sort={sort.key === "date" ? sort.dir : null} onSort={() => onSort("date")}>
              Date
            </Th>
            <Th>Particulars</Th>
            <Th className="hidden @[38rem]:table-cell">Notes</Th>
            <Th align="right" className="w-[128px] @[30rem]:w-[136px]" sort={sort.key === "amount" ? sort.dir : null} onSort={() => onSort("amount")}>
              Amount
            </Th>
            {canManage ? <Th className="w-[44px] @[30rem]:w-[52px]" aria-label="Actions" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const dir = moneyDirection(e);
            const struck = !accounting && isCancelled(e, e.mirrorStatus);
            const state = reversalState(e, e.mirrorStatus);
            const badge = e.reversesEntryId ? <Badge>Reversal</Badge> : e.reversedByEntryId && (accounting || state !== "done") ? <ReversedBadge entry={e} /> : null;
            const from = sideName(e.from);
            const to = sideName(e.to);
            const note = noteText(e);
            const why = cannotReverse(e, isAdmin);
            return (
              <Tr key={e.id}>
                <Td className={clsx("num whitespace-nowrap", struck ? "text-ink-subtle line-through" : "text-ink-muted")}>{dayLabel(e.businessDay)}</Td>
                <th scope="row" className={clsx(tableClass.td, "text-left font-normal")}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={clsx("flex min-w-0 items-center gap-1.5", struck && "text-ink-subtle line-through")} title={`${from} → ${to}${note ? `\n${note}` : ""}`}>
                      <span className={clsx("min-w-0 truncate", !struck && "text-ink")}>{from}</span>
                      <span aria-label="to" className="shrink-0 text-ink-faint">
                        →
                      </span>
                      <span className={clsx("min-w-0 truncate", !struck && "text-ink")}>{to}</span>
                    </span>
                    {badge ? <span className="shrink-0 @[38rem]:hidden">{badge}</span> : null}
                  </span>
                </th>
                <Td className="hidden @[38rem]:table-cell">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={clsx("min-w-0 truncate", struck ? "text-ink-subtle line-through" : "text-ink-muted")} title={note || undefined}>
                      {note}
                    </span>
                    {badge ? <span className="shrink-0">{badge}</span> : null}
                  </span>
                </Td>
                <Td num>
                  <span className={clsx("font-medium", struck ? "text-ink-subtle line-through" : dir === "IN" ? "text-success" : dir === "INTERNAL" ? "text-ink-muted" : "text-ink")}>
                    {dir === "IN" ? "+" : dir === "OUT" ? "−" : ""}
                    {formatINR(e.amountPaise)}
                  </span>
                  <span className="sr-only">{dir === "IN" ? "money in" : dir === "OUT" ? "money out" : "between accounts"}</span>
                  {e.syncStatus !== "SYNCED" ? <SyncLine entry={e} /> : null}
                </Td>
                {canManage ? (
                  <Td align="right">
                    <Menu size="sm" label="Entry actions" items={[{ label: "Reverse…", icon: <Undo2 />, danger: true, disabled: Boolean(why) || reversing !== null, hint: why ?? undefined, onSelect: () => setReversing(e) }]} />
                  </Td>
                ) : null}
              </Tr>
            );
          })}
        </tbody>
      </table>
      {reversing ? <ReverseDialog entry={reversing} onClose={() => setReversing(null)} /> : null}
    </>
  );
}

/** Under an amount, only for the exceptions: "Posting…" while it goes to the books, "Not posted" (why on hover) with Retry. */
function SyncLine({ entry: e }: { entry: MoneyEntryRow }) {
  const [busy, setBusy] = useState(false);
  if (e.syncStatus === "PENDING") {
    return (
      <span className="mt-0.5 flex items-center justify-end gap-1 text-caption text-warning">
        <Spinner className="size-3 text-warning" />
        Posting…
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex items-center justify-end gap-1.5 text-caption">
      <span className="text-danger" title={e.hlSyncError ?? "The books refused it"}>
        Not posted
      </span>
      <button
        type="button"
        className="font-medium text-accent hover:underline disabled:opacity-50"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void retryMoneyEntrySync(e.id).finally(() => setBusy(false));
        }}
      >
        Retry
      </button>
    </span>
  );
}

/** onSelect: rows open a details panel when given (Expenses). hideKind: every row is the same kind (Expenses), so the column is left out. */
export function EntriesTable({ rows, isAdmin, onSelect, selectedId, hideKind }: { rows: MoneyEntryRow[]; isAdmin: boolean; onSelect?: (e: MoneyEntryRow) => void; selectedId?: string | null; hideKind?: boolean }) {
  const [reversing, setReversing] = useState<MoneyEntryRow | null>(null);
  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Day</Th>
            <Th>From → To</Th>
            {hideKind ? null : <Th>Kind</Th>}
            <Th align="right">Amount</Th>
            <Th>Note</Th>
            <Th>By</Th>
            <Th>Status</Th>
            <Th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const dir = moneyDirection(e);
            const cancelled = isCancelled(e, e.mirrorStatus);
            return (
              <Tr key={e.id} onOpen={onSelect ? () => onSelect(e) : undefined} selected={onSelect ? e.id === selectedId : undefined}>
                <Td className="whitespace-nowrap" muted={cancelled}>
                  {e.businessDay}
                </Td>
                <Td>
                  <span className="flex min-w-36 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={clsx(cancelled && "text-ink-subtle line-through")}>
                      {sideName(e.from)} → {sideName(e.to)}
                    </span>
                    {e.reversesEntryId ? <Badge>Reversal</Badge> : e.reversedByEntryId ? <ReversedBadge entry={e} /> : null}
                    {e.gst ? <span className="text-caption text-ink-muted">GST bill {e.gst.billNo}</span> : null}
                  </span>
                </Td>
                {hideKind ? null : (
                  <Td muted>
                    {MONEY_CATEGORY_LABEL[moneyCategory(e)]}
                  </Td>
                )}
                <Td num className="whitespace-nowrap">
                  <span className={cancelled ? "text-ink-subtle" : amountClass(dir)}>
                    {amountSign(dir)}
                    {formatINR(e.amountPaise)}
                  </span>
                </Td>
                <Td className="max-w-60" muted>
                  <span className="line-clamp-2 min-w-24" title={e.note ?? undefined}>
                    {e.note ?? ""}
                  </span>
                </Td>
                <Td muted>
                  <span className="block max-w-24 truncate" title={e.createdBy}>
                    {e.createdBy}
                  </span>
                </Td>
                <Td onClick={(ev) => ev.stopPropagation()}>{e.syncStatus === "SYNCED" ? null : <StatusCell entry={e} />}</Td>
                <Td align="right" onClick={(ev) => ev.stopPropagation()}>
                  {canReverse(e) && (!e.isCorrection || isAdmin) ? <Menu size="sm" label="Entry actions" items={[{ label: "Reverse", icon: <Undo2 />, onSelect: () => setReversing(e) }]} /> : null}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      {reversing ? <ReverseDialog entry={reversing} onClose={() => setReversing(null)} /> : null}
    </>
  );
}

const retryLink = "text-label font-medium text-accent hover:underline disabled:opacity-50";

/** An original's reversal: it only counts as undone once the reversal is in the books. */
export function ReversedBadge({ entry: e }: { entry: MoneyEntryRow }) {
  const [busy, setBusy] = useState(false);
  const state = reversalState(e, e.mirrorStatus);
  if (state === "done") return <Badge>Reversed</Badge>;
  if (state === "pending") return <Badge tone="warning">Reversal pending</Badge>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone="danger">Reversal not posted</Badge>
      <button
        type="button"
        className={retryLink}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void retryMoneyEntrySync(e.reversedByEntryId!).finally(() => setBusy(false));
        }}
      >
        Retry
      </button>
    </span>
  );
}

/** Whether an entry is in the books. In a table the saved (normal) state is left blank by the caller. */
export function StatusCell({ entry: e }: { entry: MoneyEntryRow }) {
  const [busy, setBusy] = useState(false);
  if (e.syncStatus === "SYNCED") return <span className="text-ink">In the books</span>;
  if (e.syncStatus === "PENDING") return <Badge>Saving to books…</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1" title={e.hlSyncError ?? undefined}>
      <Badge tone="danger">Not posted</Badge>
      <span className="max-w-56 text-caption text-danger">{e.hlSyncError ?? "error"}</span>
      <button
        type="button"
        className={retryLink}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void retryMoneyEntrySync(e.id).finally(() => setBusy(false));
        }}
      >
        Retry
      </button>
    </span>
  );
}

/** Reverse an entry: its exact opposite is recorded today. Nothing is deleted. A reason is kept with it. */
export function ReverseDialog({ entry: e, onClose }: { entry: MoneyEntryRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      title="Reverse this entry?"
      danger
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {!reason.trim() ? <span className="mr-auto text-label text-ink-muted">Give a reason.</span> : null}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!reason.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await reverseMoneyEntry(e.id, reason);
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            }}
          >
            {busy ? "Reversing…" : "Reverse"}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">
        This posts <b className="num font-semibold">{formatINR(e.amountPaise)}</b> back from {sideName(e.to)} to {sideName(e.from)}. The original entry stays visible with its reversal beside it. Nothing is deleted.
      </p>
      <Field label="Reason" htmlFor="rev-reason">
        <Input id="rev-reason" value={reason} onChange={(ev) => setReason(ev.target.value)} autoFocus maxLength={400} />
      </Field>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
