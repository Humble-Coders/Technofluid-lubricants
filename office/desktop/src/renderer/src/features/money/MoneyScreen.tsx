import clsx from "clsx";
import { Plus, RefreshCw, Scale, Settings2, Undo2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { canReverse, formatINR, indiaDate, isCancelled, MONEY_CATEGORIES, MONEY_CATEGORY_LABEL, moneyCategory, moneyDirection, reversalState, type MoneyAccountRef, type MoneyCategory } from "@technofluid/core";
import { Badge, Banner, Button, Dialog, EmptyState, ErrorState, Field, FilterPill, FilterSelect, Input, LoadingState, Menu, Page, PageHeader, StatTile, Table, Td, Th, Tr } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { useEntities, useEntityBalances } from "@/hooks/useEntities";
import { useMoneyEntries, useMoneyEntry, useRegisterBalances, useRegisters } from "@/hooks/useMoney";
import { retryMoneyEntrySync, reverseMoneyEntry, type MoneyEntryRow, type RegisterRow } from "@/services/moneyService";
import { amountClass, amountSign, CorrectionDialog, MoneyEntryForm } from "./MoneyForms";
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

/**
 * Money in & out (Admin, Accounts): our cash and bank balances from the books, quick
 * actions, and every entry (expenses too). Nothing is edited or deleted — Reverse writes
 * the mirror. After a save it shows "Saving to books…" and only refreshes balances once
 * the entry is in the books (never against a stale balance — Aromex #173).
 */
export function MoneyScreen() {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const navigate = useNavigate();
  const today = indiaDate();
  const registers = useRegisters();
  const regs = useMemo(() => (registers.status === "ready" ? registers.data : []), [registers]);
  const entities = useEntities();
  const parties = useMemo(() => (entities.status === "ready" ? entities.data : []), [entities]);
  const books = useRegisterBalances();
  const partyBooks = useEntityBalances(null);
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<[string, string]>(rangeFor("month", today));
  const [from, to] = preset === "custom" ? custom : rangeFor(preset, today);
  const entries = useMoneyEntries(from, to);
  const [category, setCategory] = useState<MoneyCategory | "">("");
  const [registerFilter, setRegisterFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [showReversed, setShowReversed] = useState(false);
  const [recording, setRecording] = useState(false);
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
    }
  }, [saved?.syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (entries.status !== "ready") return [];
    return entries.data.filter((e) => {
      if (!showReversed && isCancelled(e, e.mirrorStatus)) return false;
      if (category && moneyCategory(e) !== category) return false;
      const ids = [e.from, e.to].map((r) => (r.kind === "PARTY" ? r.entityId : r.kind === "CASH" || r.kind === "BANK" ? r.registerId : ""));
      if (registerFilter && !ids.includes(registerFilter)) return false;
      if (partyFilter && !ids.includes(partyFilter)) return false;
      return true;
    });
  }, [entries, showReversed, category, registerFilter, partyFilter]);

  return (
    <Page>
      <PageHeader
        title="Money in & out"
        actions={
          <>
            {isAdmin ? (
              <Button icon={<Scale />} onClick={() => setCorrecting(true)}>
                Correction
              </Button>
            ) : null}
            <Button variant="primary" icon={<Plus />} onClick={() => setRecording(true)}>
              Record money
            </Button>
            {isAdmin ? <Menu items={[{ label: "Cash & bank accounts", icon: <Settings2 />, onSelect: () => setManaging(true) }]} /> : null}
          </>
        }
        toolbar={
          <>
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
            {preset === "custom" ? (
              <>
                <Input type="date" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} aria-label="From" className="w-36" />
                <span className="text-ink-muted">–</span>
                <Input type="date" value={custom[1]} min={custom[0]} max={today} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} aria-label="To" className="w-36" />
              </>
            ) : null}
            <FilterSelect label="Kind" value={category} onChange={(v) => setCategory(v as MoneyCategory | "")} options={[["", "All"], ...MONEY_CATEGORIES.map((c): [string, string] => [c, MONEY_CATEGORY_LABEL[c]])]} />
            <FilterSelect label="Cash or bank" value={registerFilter} onChange={setRegisterFilter} options={[["", "All"], ...regs.map((r): [string, string] => [r.id, r.name])]} />
            <FilterSelect label="Customer or supplier" value={partyFilter} onChange={setPartyFilter} options={[["", "All"], ...parties.map((p): [string, string] => [p.id, p.name])]} />
            <FilterPill active={showReversed} onClick={() => setShowReversed((v) => !v)}>
              Show reversed
            </FilterPill>
          </>
        }
      />

      {books.error ? (
        <Banner
          tone="warning"
          title="Books unreachable, so balances can't be shown right now."
          className="mb-6"
          action={
            <Button size="sm" onClick={() => void books.retry()} loading={books.loading} icon={<RefreshCw />}>
              Retry
            </Button>
          }
        >
          {books.error}
        </Banner>
      ) : null}

      {regs.some((r) => r.isActive) ? (
        <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
          {regs
            .filter((r) => r.isActive)
            .map((r) => (
              <RegisterTile key={r.id} register={r} balance={books.error ? null : books.balances ? (books.balances[r.id] ?? 0) : null} onOpen={() => navigate(`/payments/registers/${r.id}`)} />
            ))}
        </div>
      ) : null}

      {saved && saved.syncStatus !== "SYNCED" ? (
        saved.syncStatus === "FAILED" ? (
          <Banner tone="danger" className="mb-4">
            Not posted: {saved.hlSyncError ?? "the books refused it"}
          </Banner>
        ) : (
          <Banner tone="info" className="mb-4">
            Saving to books…
          </Banner>
        )
      ) : null}

      {entries.status === "loading" ? (
        <LoadingState />
      ) : entries.status === "error" ? (
        <ErrorState>{entries.message}</ErrorState>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Wallet />} title="Nothing in these dates">
          Record money in or out with Record money above.
        </EmptyState>
      ) : (
        <EntriesTable rows={rows} isAdmin={isAdmin} />
      )}

      {recording ? (
        <MoneyEntryForm
          parties={parties}
          registers={regs.filter((r) => !r.placeholder)}
          onClose={(id) => {
            setRecording(false);
            if (id) setLastSaved(id);
          }}
        />
      ) : null}
      {correcting ? (
        <CorrectionDialog
          parties={parties}
          registers={regs.filter((r) => !r.placeholder)}
          partyBalances={partyBooks.balances}
          registerBalances={books.balances}
          onClose={(id) => {
            setCorrecting(false);
            if (id) setLastSaved(id);
          }}
        />
      ) : null}
      {managing ? <RegistersPanel registers={regs} balances={books.balances} onClose={() => setManaging(false)} /> : null}
    </Page>
  );
}

/** One cash/bank balance as a top figure; it opens that account's history. */
function RegisterTile({ register: r, balance, onOpen }: { register: RegisterRow; balance: number | null; onOpen: () => void }) {
  return (
    <StatTile
      label={r.name}
      value={balance === null ? "-" : formatINR(balance)}
      tone={balance !== null && balance < 0 ? "danger" : undefined}
      onClick={r.placeholder ? undefined : onOpen}
      hint={
        r.syncStatus !== "SYNCED" ? (
          r.placeholder ? (
            "Not set up yet"
          ) : r.syncStatus === "FAILED" ? (
            <span className="text-danger">Couldn't save to books</span>
          ) : (
            "Saving to books…"
          )
        ) : undefined
      }
    />
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

export function ReverseDialog({ entry: e, onClose }: { entry: MoneyEntryRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      title="Reverse this entry"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {!reason.trim() ? <span className="mr-auto text-label text-ink-muted">Give a reason.</span> : null}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
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
      <div>
        <p className="text-body font-medium text-ink">
          {sideName(e.from)} → {sideName(e.to)}
        </p>
        <p className="num mt-0.5 text-label text-ink-muted">
          {formatINR(e.amountPaise)} · {e.businessDay}
        </p>
      </div>
      <p className="text-label text-ink-muted">An exact opposite entry is recorded today. Nothing is deleted; both stay on the statements.</p>
      <Field label="Reason" htmlFor="rev-reason">
        <Input id="rev-reason" value={reason} onChange={(ev) => setReason(ev.target.value)} autoFocus maxLength={400} />
      </Field>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
