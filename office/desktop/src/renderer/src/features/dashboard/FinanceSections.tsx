import clsx from "clsx";
import { Link2Off, Pencil, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatINR } from "@technofluid/core";
import { Badge, Banner, Button, IconButton, LoadingState, Section, StatTile, StatTiles } from "@/components/ui";
import { CorrectionDialog } from "@/features/money/MoneyForms";
import { useEntities, useEntityBalances } from "@/hooks/useEntities";
import { useRegisterBalances, useRegisters } from "@/hooks/useMoney";
import type { RegisterRow } from "@/services/moneyService";

/**
 * The dashboard's money part (Aromex's dashboard, in Technofluid's numbers), for Admin and Accounts:
 *  - Balances: Cash | Bank side by side; each a total, then every account that makes it up.
 *    Balances come from the books (Humble Ledger) as of now, never added up from entries here.
 *    A balance the books haven't given yet shows "-" (not known), never a fake ₹0.00.
 *    Admins get a pencil per account to correct its balance (posts the difference).
 *  - Money owed: what customers owe us and what we owe suppliers, from the books; each opens
 *    Customers & suppliers filtered to those names.
 * Colour only for exceptions: an overdrawn account is red; everything else is plain text.
 */
export function FinanceSections({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate();
  const registers = useRegisters();
  const books = useRegisterBalances();
  const entities = useEntities();
  const [savedKey, setSavedKey] = useState(0);
  const partyBooks = useEntityBalances(savedKey);
  const [correcting, setCorrecting] = useState<RegisterRow | null>(null);

  const regs = useMemo(() => (registers.status === "ready" ? registers.data.filter((r) => r.isActive && !r.placeholder) : []), [registers]);
  const cash = regs.filter((r) => r.kind === "CASH");
  const bank = regs.filter((r) => r.kind === "BANK");
  const balanceOf = (r: RegisterRow): number | null => books.balances?.[r.id] ?? null;
  const totalOf = (list: RegisterRow[]): number | null => {
    if (!books.balances || list.length === 0) return list.length === 0 ? 0 : null;
    let sum = 0;
    for (const r of list) {
      const b = balanceOf(r);
      if (b === null) return null;
      sum += b;
    }
    return sum;
  };

  const parties = useMemo(() => (entities.status === "ready" ? entities.data : []), [entities]);
  const owed = useMemo(() => {
    if (!partyBooks.balances) return null;
    let toReceive = 0;
    let toGive = 0;
    let receiveCount = 0;
    let giveCount = 0;
    for (const e of parties) {
      const b = partyBooks.balances[e.id]?.balancePaise ?? 0;
      if (b > 0) {
        toReceive += b;
        receiveCount++;
      } else if (b < 0) {
        toGive += -b;
        giveCount++;
      }
    }
    return { toReceive, toGive, receiveCount, giveCount };
  }, [parties, partyBooks.balances]);

  const refreshing = books.loading || partyBooks.loading;
  const refresh = () => {
    void books.retry();
    void partyBooks.retry();
  };
  // Ctrl/⌘+R refreshes the figures (not the window), as on Money in & out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const waiting = !books.balances && !books.error;
  const booksError = books.error ?? partyBooks.error;

  return (
    <>
      <Section
        title="Balances"
        description={waiting && !refreshing ? "Waiting for Humble Ledger. A dash means not known yet, not zero." : "As of now, from the books."}
        action={
          <Button size="sm" icon={<RefreshCw />} onClick={refresh} loading={refreshing} title="Refresh the figures (Ctrl+R)">
            {refreshing ? "Updating…" : "Refresh"}
          </Button>
        }
      >
        {booksError ? (
          <Banner
            tone="warning"
            className="mb-4"
            action={
              <Button size="sm" onClick={refresh} loading={refreshing}>
                Retry
              </Button>
            }
          >
            Couldn't reach the books: {booksError}. The figures shown may be out of date.
          </Banner>
        ) : null}
        {registers.status === "loading" ? (
          <LoadingState label="Loading accounts…" className="py-10" />
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-2">
            <AccountColumn label="Cash" total={totalOf(cash)} rows={cash} empty="No cash accounts." balanceOf={balanceOf} onEdit={isAdmin ? setCorrecting : null} />
            <AccountColumn label="Bank" total={totalOf(bank)} rows={bank} empty="No bank accounts." balanceOf={balanceOf} onEdit={isAdmin ? setCorrecting : null} />
          </div>
        )}
      </Section>

      <Section title="Money owed" description="From the books. Open one to see who.">
        <StatTiles>
          <StatTile
            label="They owe us"
            value={owed ? formatINR(owed.toReceive) : "-"}
            loading={!owed && partyBooks.loading}
            hint={owed ? `${owed.receiveCount} ${owed.receiveCount === 1 ? "name" : "names"}` : undefined}
            onClick={() => navigate("/customers?show=receivable")}
          />
          <StatTile
            label="We owe them"
            value={owed ? formatINR(owed.toGive) : "-"}
            loading={!owed && partyBooks.loading}
            hint={owed ? `${owed.giveCount} ${owed.giveCount === 1 ? "name" : "names"}` : undefined}
            onClick={() => navigate("/customers?show=payable")}
          />
        </StatTiles>
      </Section>

      {correcting ? (
        <CorrectionDialog
          parties={parties}
          registers={regs}
          partyBalances={partyBooks.balances}
          registerBalances={books.balances}
          initialTarget={`R:${correcting.id}`}
          onClose={(id) => {
            setCorrecting(null);
            if (id) {
              setSavedKey((k) => k + 1);
              void books.retry();
            }
          }}
        />
      ) : null}
    </>
  );
}

function AccountColumn({
  label,
  total,
  rows,
  empty,
  balanceOf,
  onEdit,
}: {
  label: string;
  total: number | null;
  rows: RegisterRow[];
  empty: string;
  balanceOf: (r: RegisterRow) => number | null;
  onEdit: ((r: RegisterRow) => void) | null;
}) {
  return (
    <div className="min-w-0">
      <StatTile label={label} value={<Amount paise={total} />} />
      <dl className="mt-6 border-b border-line-row">
        {rows.length === 0 ? (
          <div className="flex min-h-11 items-center border-t border-line-row text-label text-ink-subtle">{empty}</div>
        ) : (
          rows.map((r) => {
            const balance = balanceOf(r);
            const onBooks = r.syncStatus === "SYNCED";
            return (
              <div key={r.id} className="flex min-h-11 items-center justify-between gap-6 border-t border-line-row">
                <dt className="selectable min-w-0 truncate text-body text-ink">{r.name}</dt>
                <dd className="flex shrink-0 items-center gap-2 text-right text-body">
                  {onBooks ? null : (
                    <span title={r.hlSyncError ?? "Waiting for its account in the books to be created."}>
                      <Badge tone="warning">
                        <Link2Off className="size-3" aria-hidden /> Not on the books yet
                      </Badge>
                    </span>
                  )}
                  <Amount paise={balance} />
                  {onEdit ? (
                    <IconButton label={`Correct the balance of ${r.name}`} size="sm" onClick={() => onEdit(r)} disabled={balance === null || !onBooks}>
                      <Pencil />
                    </IconButton>
                  ) : null}
                </dd>
              </div>
            );
          })
        )}
      </dl>
    </div>
  );
}

/** A balance from the books: "-" while not known (never ₹0.00), red when below zero. */
function Amount({ paise }: { paise: number | null }) {
  if (paise === null)
    return (
      <span className="text-ink-subtle">
        <span aria-hidden>-</span>
        <span className="sr-only">not known yet</span>
      </span>
    );
  return <span className={clsx("num", paise < 0 && "text-danger")}>{formatINR(paise)}</span>;
}
