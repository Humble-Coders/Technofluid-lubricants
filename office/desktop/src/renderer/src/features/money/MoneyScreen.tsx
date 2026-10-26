import clsx from "clsx";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CloudOff, Landmark, RefreshCw, Scale, Settings2, Shuffle, Undo2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { canReverse, formatINR, indiaDate, isCancelled, moneyDirection, type MoneyAccountRef } from "@technofluid/core";
import { Badge, Button, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { Modal } from "@/features/entities/EntityDetail";
import { useEntities, useEntityBalances } from "@/hooks/useEntities";
import { useMoneyEntries, useMoneyEntry, useRegisterBalances, useRegisters } from "@/hooks/useMoney";
import { retryMoneyEntrySync, reverseMoneyEntry, type MoneyEntryRow, type RegisterRow } from "@/services/moneyService";
import { amountClass, CorrectionDialog, MoneyEntryForm, type QuickAction } from "./MoneyForms";
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
  const [direction, setDirection] = useState<"all" | "IN" | "OUT" | "INTERNAL">("all");
  const [registerFilter, setRegisterFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [showReversed, setShowReversed] = useState(false);
  const [action, setAction] = useState<QuickAction | null>(null);
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
      if (!showReversed && isCancelled(e)) return false;
      if (direction !== "all" && moneyDirection(e) !== direction) return false;
      const ids = [e.from, e.to].map((r) => (r.kind === "PARTY" ? r.entityId : r.kind === "CASH" || r.kind === "BANK" ? r.registerId : ""));
      if (registerFilter && !ids.includes(registerFilter)) return false;
      if (partyFilter && !ids.includes(partyFilter)) return false;
      return true;
    });
  }, [entries, showReversed, direction, registerFilter, partyFilter]);

  const QUICK: { key: QuickAction; label: string; icon: typeof Wallet }[] = [
    { key: "received", label: "Money received", icon: ArrowDownLeft },
    { key: "paid", label: "Money paid", icon: ArrowUpRight },
    { key: "transfer", label: "Deposit / withdraw / transfer", icon: ArrowLeftRight },
    { key: "move", label: "Move balance", icon: Shuffle },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 px-5 py-4">
        {books.error ? (
          <div role="alert" className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
            <CloudOff className="size-4 shrink-0" />
            <span className="flex-1">Books unreachable — balances can't be shown right now. {books.error}</span>
            <Button size="sm" onClick={() => void books.retry()} loading={books.loading} icon={<RefreshCw className="size-3.5" />}>
              Retry
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {regs
            .filter((r) => r.isActive)
            .map((r) => (
              <RegisterCard key={r.id} register={r} balance={books.error ? null : books.balances ? (books.balances[r.id] ?? 0) : null} onOpen={() => navigate(`/payments/registers/${r.id}`)} />
            ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {QUICK.map((q) => (
            <Button key={q.key} icon={<q.icon className="size-3.5" />} onClick={() => setAction(q.key)}>
              {q.label}
            </Button>
          ))}
          {isAdmin ? (
            <Button icon={<Scale className="size-3.5" />} onClick={() => setCorrecting(true)}>
              Correction
            </Button>
          ) : null}
          <span className="flex-1" />
          {isAdmin ? (
            <Button size="sm" variant="ghost" icon={<Settings2 className="size-3.5" />} onClick={() => setManaging(true)}>
              Cash & bank accounts
            </Button>
          ) : null}
        </div>

        {saved && saved.syncStatus !== "SYNCED" ? (
          <p className={clsx("rounded-md px-3 py-2 text-[12px]", saved.syncStatus === "FAILED" ? "bg-danger-soft text-danger" : "bg-canvas text-ink-muted")}>
            {saved.syncStatus === "FAILED" ? `Not posted: ${saved.hlSyncError ?? "the books refused it"}` : "Saving to books…"}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Dates" className="w-36">
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">This month</option>
            <option value="custom">Custom…</option>
          </Select>
          {preset === "custom" ? (
            <>
              <Input type="date" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} aria-label="From" className="w-36" />
              <span className="text-ink-muted">–</span>
              <Input type="date" value={custom[1]} min={custom[0]} max={today} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} aria-label="To" className="w-36" />
            </>
          ) : null}
          <Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} aria-label="Direction" className="w-36">
            <option value="all">In and out</option>
            <option value="IN">Money in</option>
            <option value="OUT">Money out</option>
            <option value="INTERNAL">Transfers / moves</option>
          </Select>
          <Select value={registerFilter} onChange={(e) => setRegisterFilter(e.target.value)} aria-label="Cash or bank" className="w-44">
            <option value="">All cash & bank</option>
            {regs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} aria-label="Customer or supplier" className="w-52">
            <option value="">All customers & suppliers</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-[12px] text-ink">
            <input type="checkbox" checked={showReversed} onChange={(e) => setShowReversed(e.target.checked)} className="size-3.5 accent-brand-orange" />
            Show reversed
          </label>
        </div>

        {entries.status === "loading" ? (
          <Spinner />
        ) : entries.status === "error" ? (
          <p className="text-[12px] text-danger">{entries.message}</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Wallet className="size-6" />} title="Nothing in these dates">
            Record money received or paid with the buttons above.
          </EmptyState>
        ) : (
          <EntriesTable rows={rows} isAdmin={isAdmin} />
        )}
      </div>

      {action ? (
        <MoneyEntryForm
          action={action}
          parties={parties}
          registers={regs.filter((r) => !r.placeholder)}
          onClose={(id) => {
            setAction(null);
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
    </div>
  );
}

function RegisterCard({ register: r, balance, onOpen }: { register: RegisterRow; balance: number | null; onOpen: () => void }) {
  const Icon = r.kind === "CASH" ? Wallet : Landmark;
  return (
    <button type="button" onClick={onOpen} disabled={r.placeholder} className="rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-hover disabled:opacity-60" title="Open its history">
      <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <Icon className="size-3.5" /> {r.name}
      </p>
      <p className={clsx("num text-[20px] font-semibold", balance !== null && balance < 0 ? "text-danger" : "text-ink")}>{balance === null ? "—" : formatINR(balance)}</p>
      {r.syncStatus !== "SYNCED" ? <p className="text-2xs text-ink-faint">{r.placeholder ? "Not set up yet" : r.syncStatus === "FAILED" ? "Couldn't save to books" : "Saving to books…"}</p> : null}
    </button>
  );
}

export function EntriesTable({ rows, isAdmin }: { rows: MoneyEntryRow[]; isAdmin: boolean }) {
  const [reversing, setReversing] = useState<MoneyEntryRow | null>(null);
  return (
    <>
      <table className="w-full border-collapse text-[13px]">
        <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
          <tr className="border-b border-line">
            <th className="py-2 pr-3 font-medium">Day</th>
            <th className="py-2 pr-3 font-medium">From → To</th>
            <th className="py-2 pr-3 text-right font-medium">Amount</th>
            <th className="py-2 pr-3 font-medium">Note</th>
            <th className="py-2 pr-3 font-medium">By</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const dir = moneyDirection(e);
            const cancelled = isCancelled(e);
            return (
              <tr key={e.id} className={clsx("border-b border-line/70 align-top", cancelled && "text-ink-faint")}>
                <td className="py-2 pr-3 whitespace-nowrap">{e.businessDay}</td>
                <td className="py-2 pr-3">
                  <span className={clsx(cancelled && "line-through")}>
                    {sideName(e.from)} → {sideName(e.to)}
                  </span>
                  {e.to.kind === "EXPENSE" ? <Badge tone="danger" className="ml-1.5">Expense</Badge> : null}
                  {e.isCorrection ? <Badge tone="warning" className="ml-1.5">Correction</Badge> : null}
                  {e.reversesEntryId ? <Badge className="ml-1.5">Reversal</Badge> : e.reversedByEntryId ? <Badge className="ml-1.5">Reversed</Badge> : null}
                  {e.gst ? <span className="ml-1.5 text-2xs text-ink-muted">GST bill {e.gst.billNo}</span> : null}
                </td>
                <td className={clsx("py-2 pr-3 text-right", cancelled ? "num text-ink-faint" : amountClass(dir))}>{formatINR(e.amountPaise)}</td>
                <td className="max-w-60 py-2 pr-3 text-ink-muted">{e.note ?? ""}</td>
                <td className="py-2 pr-3 text-ink-muted">{e.createdBy}</td>
                <td className="py-2 pr-3">
                  <StatusCell entry={e} />
                </td>
                <td className="py-2 text-right">
                  {canReverse(e) && (!e.isCorrection || isAdmin) ? (
                    <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => setReversing(e)}>
                      Reverse
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {reversing ? <ReverseDialog entry={reversing} onClose={() => setReversing(null)} /> : null}
    </>
  );
}

function StatusCell({ entry: e }: { entry: MoneyEntryRow }) {
  const [busy, setBusy] = useState(false);
  if (e.syncStatus === "SYNCED") return <span className="text-[12px] text-success">In the books</span>;
  if (e.syncStatus === "PENDING") return <span className="text-[12px] text-ink-muted">Saving to books…</span>;
  return (
    <span className="flex flex-wrap items-center gap-1 text-[12px] text-danger" title={e.hlSyncError ?? undefined}>
      Not posted: {e.hlSyncError ?? "error"}
      <button
        type="button"
        className="font-medium text-info hover:underline disabled:opacity-50"
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

function ReverseDialog({ entry: e, onClose }: { entry: MoneyEntryRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Reverse this entry" onClose={onClose} busy={busy}>
      <p className="text-[13px] text-ink">
        {sideName(e.from)} → {sideName(e.to)} · {formatINR(e.amountPaise)} · {e.businessDay}
      </p>
      <p className="text-[12px] text-ink-muted">An exact opposite entry is recorded today. Nothing is deleted; both stay on the statements.</p>
      <Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Reason (required)" autoFocus maxLength={400} aria-label="Reason" />
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
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
          Reverse
        </Button>
      </div>
    </Modal>
  );
}
