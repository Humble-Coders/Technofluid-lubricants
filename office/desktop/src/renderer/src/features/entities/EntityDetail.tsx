import clsx from "clsx";
import { Archive, ArchiveRestore, IndianRupee, Link2, Pencil, ReceiptIndianRupee, RefreshCw, Scale, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatINR, GST_STATES, indiaDate } from "@technofluid/core";
import { Badge, Banner, Button, Detail, Details, Dialog, Field, IconButton, Input, LoadingState, Menu, Section, Select, Spinner, Table, Tabs, Td, Th, Tr } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { useEntities, useEntityHistory, useEntityStatement } from "@/hooks/useEntities";
import { useMoneyEntry, useRegisters } from "@/hooks/useMoney";
import { CorrectionDialog, MoneyEntryForm } from "@/features/money/MoneyForms";
import {
  linkEntityToDistributor,
  retryEntitySync,
  setEntityActive,
  watchApprovedDistributors,
  type DistributorChoice,
  type EntityRow,
} from "@/services/entityService";
import type { EntityBalance } from "@/services/ledgerService";
import { BalanceText } from "./EntitiesScreen";

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  kinds: "Kind",
  phones: "Phones",
  email: "Email",
  gstin: "GSTIN",
  address: "Address",
  priceTier: "Price list",
  creditLimitPaise: "Credit limit",
  notes: "Notes",
  distributorId: "Linked distributor",
  isActive: "Active",
};

const show = (field: string, v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "creditLimitPaise" && typeof v === "number") return formatINR(v);
  if (field === "address" && typeof v === "object") {
    const a = v as Record<string, string | null>;
    return [a.line1, a.city, a.stateCode ? GST_STATES[a.stateCode] : null].filter(Boolean).join(", ") || "—";
  }
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
};

/** Start of the Indian financial year that `today` is in (1 April). */
function fyStart(today: string): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return `${m >= 4 ? y : y - 1}-04-01`;
}

/** The right-hand panel: balance, details, the statement from the books, and history. */
export function EntityDetail({
  entity: e,
  balance,
  booksError,
  onEdit,
  onClose,
  onChanged,
}: {
  entity: EntityRow;
  balance: EntityBalance | null;
  booksError: string | null;
  onEdit: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const navigate = useNavigate();
  const [tab, setTab] = useState<"statement" | "history">("statement");
  const [archiving, setArchiving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  // After a payment or correction, refresh the balance only once it's in the books.
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const saved = useMoneyEntry(lastSaved);
  useEffect(() => {
    if (saved?.syncStatus === "SYNCED") {
      setLastSaved(null);
      onChanged();
    }
  }, [saved?.syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  const registers = useRegisters();
  const regs = registers.status === "ready" ? registers.data.filter((r) => !r.placeholder) : [];
  const all = useEntities();
  const parties = all.status === "ready" ? all.data : [];
  const state = e.address.stateCode ? GST_STATES[e.address.stateCode] : null;

  const canSell = e.isActive;
  const canBuy = e.isActive && !e.isWalkIn;
  // A supplier-only party leads with "New purchase"; everyone else with "New sale".
  const buyFirst = canBuy && !e.kinds.includes("customer");
  const newSale = () => navigate(`/sales/new?customer=${encodeURIComponent(e.id)}`);
  const newPurchase = () => navigate(`/purchases/new?supplier=${encodeURIComponent(e.id)}`);

  return (
    <aside className="flex w-1/2 max-w-170 min-w-140 shrink-0 flex-col border-l border-line">
      <header className="flex shrink-0 items-start gap-2 px-6 pt-6 pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title font-semibold text-ink">{e.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-label text-ink-muted">
            {e.kinds.map((k) => (k === "customer" ? "Customer" : "Supplier")).join(" · ")}
            {e.isWalkIn ? <Badge>Walk-in</Badge> : null}
            {!e.isActive ? <Badge>Archived</Badge> : null}
          </p>
        </div>
        <Menu
          items={[
            buyFirst ? canSell && { label: "New sale", icon: <ReceiptIndianRupee />, onSelect: newSale } : canBuy && { label: "New purchase", icon: <Truck />, onSelect: newPurchase },
            isAdmin && e.isActive && { label: "Correct balance", icon: <Scale />, onSelect: () => setCorrecting(true) },
            !e.isWalkIn && { label: e.isActive ? "Archive" : "Un-archive", icon: e.isActive ? <Archive /> : <ArchiveRestore />, onSelect: () => setArchiving(true) },
          ]}
        />
        <IconButton label="Close" onClick={onClose}>
          <X />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        <Section>
          <p className="text-label text-ink-muted">Balance</p>
          {booksError ? (
            <p className="mt-1 text-body text-warning">— books unreachable</p>
          ) : e.syncStatus !== "SYNCED" && !balance ? (
            <p className="mt-1 text-body text-ink-muted">— not in the books yet</p>
          ) : (
            <p className="mt-1 flex items-baseline gap-2">
              <BalanceText balance={balance ?? { balancePaise: 0, direction: "settled" }} className="text-headline" />
              {balance && balance.direction !== "settled" ? (
                <span className="text-label text-ink-muted">{balance.direction === "receivable" ? "they owe us" : "we owe them"}</span>
              ) : null}
            </p>
          )}
          {e.creditLimitPaise !== null ? (
            <p className={clsx("mt-0.5 text-label", balance && balance.balancePaise > e.creditLimitPaise ? "text-warning" : "text-ink-muted")}>
              Credit limit {formatINR(e.creditLimitPaise)}
              {balance && balance.balancePaise > e.creditLimitPaise ? " — over the limit" : ""}
            </p>
          ) : null}
          <SyncLine entity={e} />
          {saved && saved.syncStatus !== "SYNCED" ? (
            saved.syncStatus === "FAILED" ? (
              <Banner tone="danger" className="mt-3">
                Not posted: {saved.hlSyncError ?? "the books refused it"}
              </Banner>
            ) : (
              <p className="mt-2">
                <Badge>Saving to books…</Badge>
              </p>
            )
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {buyFirst ? (
              <Button variant="primary" icon={<Truck />} onClick={newPurchase}>
                New purchase
              </Button>
            ) : canSell ? (
              <Button variant="primary" icon={<ReceiptIndianRupee />} onClick={newSale}>
                New sale
              </Button>
            ) : null}
            {e.isActive ? (
              <Button icon={<IndianRupee />} onClick={() => setPaying(true)}>
                Record payment
              </Button>
            ) : null}
            <Button onClick={onEdit} icon={<Pencil />}>
              Edit
            </Button>
          </div>
        </Section>

        <Section title="Details">
          <Details columns={2}>
            <Detail label="Phone">{e.phones.join(", ") || "—"}</Detail>
            <Detail label="Email" className="wrap-anywhere">
              {e.email ?? "—"}
            </Detail>
            <Detail label="GSTIN">
              {e.gstin ? (
                <span className="font-mono">
                  {e.gstin}
                  {e.gstVerified ? <span className="ml-1.5 font-sans text-caption text-ink-muted">verified</span> : null}
                </span>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="State">{state ? `${state} (${e.address.stateCode})` : <span className="text-warning">Needed — edit to choose it</span>}</Detail>
            <Detail label="Address" className="col-span-2">
              {[e.address.line1, e.address.line2, e.address.city, e.address.district, e.address.pincode].filter(Boolean).join(", ") || "—"}
            </Detail>
            {e.kinds.includes("customer") ? (
              <Detail label="Price list">{e.priceTier ?? <span className="text-warning">Not chosen — Sales can't bill until it is</span>}</Detail>
            ) : null}
            <Detail label="Opening balance">
              {e.opening ? `${formatINR(e.opening.amountPaise)} ${e.opening.direction === "receivable" ? "they owed us" : "we owed them"} on ${e.opening.asOf}` : "—"}
            </Detail>
            {/* Only a customer can be a website distributor; a supplier-only party just shows an old link (to remove it). */}
            {e.kinds.includes("customer") || e.distributorId ? (
              <Detail label="Website distributor" className="col-span-2 wrap-anywhere">
                {e.distributorId ? <span className="font-mono text-label">{e.distributorId}</span> : "—"}
                {isAdmin && !e.isWalkIn ? (
                  <button type="button" className="ml-2 rounded text-label font-medium text-accent hover:underline" onClick={() => setLinking(true)}>
                    {e.distributorId ? "Change" : "Link"}
                  </button>
                ) : null}
              </Detail>
            ) : null}
            {e.notes ? (
              <Detail label="Notes" className="col-span-2">
                {e.notes}
              </Detail>
            ) : null}
          </Details>
          {e.importNotes.length ? (
            <Banner tone="warning" className="mt-4">
              {e.importNotes.join(" · ")}
            </Banner>
          ) : null}
        </Section>

        <Section>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              ["statement", "Statement"],
              ["history", "History"],
            ]}
            className="mb-4"
          />
          {tab === "statement" ? <StatementView entity={e} /> : <HistoryView entityId={e.id} />}
        </Section>
      </div>

      {archiving ? (
        <ArchiveDialog
          entity={e}
          onClose={(done) => {
            setArchiving(false);
            if (done) onChanged();
          }}
        />
      ) : null}
      {linking ? <LinkDialog entity={e} onClose={() => setLinking(false)} /> : null}
      {paying ? (
        <MoneyEntryForm
          parties={parties}
          registers={regs}
          initial={balance && balance.balancePaise < 0 ? { to: `P:${e.id}` } : { from: `P:${e.id}` }}
          onClose={(id) => {
            setPaying(false);
            if (id) setLastSaved(id);
          }}
        />
      ) : null}
      {correcting ? (
        <CorrectionDialog
          parties={parties}
          registers={regs}
          partyBalances={balance ? { [e.id]: balance } : null}
          registerBalances={null}
          initialTarget={`P:${e.id}`}
          onClose={(id) => {
            setCorrecting(false);
            if (id) setLastSaved(id);
          }}
        />
      ) : null}
    </aside>
  );
}

function SyncLine({ entity: e }: { entity: EntityRow }) {
  const [busy, setBusy] = useState(false);
  if (e.syncStatus === "SYNCED") return null;
  if (e.syncStatus === "PENDING")
    return (
      <p className="mt-2">
        <Badge>Saving to the books…</Badge>
      </p>
    );
  return (
    <Banner
      tone="danger"
      className="mt-3"
      action={
        <Button
          size="sm"
          loading={busy}
          icon={<RefreshCw />}
          onClick={() => {
            setBusy(true);
            void retryEntitySync(e.id).finally(() => setBusy(false));
          }}
        >
          Retry
        </Button>
      }
    >
      Couldn't save to the books{e.hlSyncError ? `: ${e.hlSyncError}` : "."}
    </Banner>
  );
}

function StatementView({ entity: e }: { entity: EntityRow }) {
  const today = indiaDate();
  const [from, setFrom] = useState(e.opening?.asOf && e.opening.asOf < fyStart(today) ? e.opening.asOf : fyStart(today));
  const [to, setTo] = useState(today);
  const inBooks = e.syncStatus === "SYNCED" || e.opening?.posted === true;
  const { state, retry } = useEntityStatement(e.id, from, to, inBooks);

  if (!inBooks) return <p className="text-label text-ink-muted">The statement shows once it's saved to the books.</p>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-label text-ink-muted">
        <Input type="date" value={from} max={to} onChange={(ev) => ev.target.value && setFrom(ev.target.value)} aria-label="From" className="w-40" />
        <span>–</span>
        <Input type="date" value={to} min={from} onChange={(ev) => ev.target.value && setTo(ev.target.value)} aria-label="To" className="w-40" />
      </div>
      {state.status === "loading" ? (
        <LoadingState />
      ) : state.status === "error" ? (
        <Banner
          tone="warning"
          action={
            <Button size="sm" onClick={retry} icon={<RefreshCw />}>
              Retry
            </Button>
          }
        >
          {state.message}
        </Banner>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>What</Th>
              <Th align="right">Debit</Th>
              <Th align="right">Credit</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td muted className="text-label whitespace-nowrap">
                {state.data.from}
              </Td>
              <Td muted className="text-label">
                Brought forward
              </Td>
              <Td />
              <Td />
              <Td num muted className="text-label whitespace-nowrap">
                {formatINR(state.data.openingPaise)}
              </Td>
            </Tr>
            {state.data.rows.map((r) => (
              <Tr key={r.txnIds.join("-")}>
                <Td className="text-label whitespace-nowrap">{r.date}</Td>
                <Td className="text-label">{r.what}</Td>
                <Td num className="text-label whitespace-nowrap">
                  {r.debitPaise ? formatINR(r.debitPaise) : ""}
                </Td>
                <Td num className="text-label whitespace-nowrap">
                  {r.creditPaise ? formatINR(r.creditPaise) : ""}
                </Td>
                <Td num className="text-label whitespace-nowrap">
                  <span className={r.balancePaise < 0 ? "text-danger" : undefined}>{formatINR(r.balancePaise)}</span>
                </Td>
              </Tr>
            ))}
            {state.data.rows.length === 0 ? (
              <Tr>
                <Td colSpan={5} muted className="text-label">
                  Nothing in these dates.
                </Td>
              </Tr>
            ) : null}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function HistoryView({ entityId }: { entityId: string }) {
  const history = useEntityHistory(entityId);
  if (history.status === "loading") return <LoadingState />;
  if (history.status === "error") return <Banner tone="danger">{history.message}</Banner>;
  if (history.data.length === 0) return <p className="text-label text-ink-muted">No changes yet.</p>;
  const ACTION: Record<string, string> = { create: "Added", edit: "Edited", archive: "Archived", unarchive: "Un-archived", link: "Linked", unlink: "Unlinked" };
  return (
    <ol className="border-t border-line-row">
      {history.data.map((h) => (
        <li key={h.id} className="space-y-0.5 border-b border-line-row py-3 text-label">
          <p className="font-medium text-ink">
            {ACTION[h.action] ?? h.action}
            {h.reason ? <span className="font-normal text-ink-muted"> — “{h.reason}”</span> : null}
          </p>
          {Object.entries(h.changes).map(([f, c]) => (
            <p key={f} className="wrap-anywhere text-ink">
              <span className="text-ink-muted">{FIELD_LABEL[f] ?? f}:</span>{" "}
              <span className="text-ink-muted line-through decoration-ink-faint">{show(f, c.from)}</span> → {show(f, c.to)}
            </p>
          ))}
          <p className="text-caption text-ink-subtle">
            {h.by} · {h.at ? h.at.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "just now"}
          </p>
        </li>
      ))}
    </ol>
  );
}

function ArchiveDialog({ entity: e, onClose }: { entity: EntityRow; onClose: (done: boolean) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archive = e.isActive;
  return (
    <Dialog
      title={`${archive ? "Archive" : "Un-archive"} ${e.name}`}
      onClose={() => onClose(false)}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={() => onClose(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setError(null);
              if (!reason.trim()) return setError("Please give a reason.");
              setBusy(true);
              try {
                await setEntityActive(e.id, !archive, reason);
                onClose(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            }}
          >
            {archive ? "Archive" : "Un-archive"}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink-muted">
        {archive ? "Only a zero balance can be archived — it's archived in the books too." : "It shows in the lists again, and in the books."}
      </p>
      <Field label="Reason" htmlFor="entity-archive-reason">
        <Input id="entity-archive-reason" value={reason} onChange={(ev) => setReason(ev.target.value)} autoFocus maxLength={300} />
      </Field>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}

function LinkDialog({ entity: e, onClose }: { entity: EntityRow; onClose: () => void }) {
  const [choices, setChoices] = useState<DistributorChoice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState(e.distributorId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => watchApprovedDistributors(setChoices, (err) => setLoadError(err.message)), []);
  const sorted = useMemo(() => choices ?? [], [choices]);
  return (
    <Dialog
      title="Link to a website distributor"
      subtitle={e.name}
      size="md"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            icon={<Link2 />}
            onClick={async () => {
              setError(null);
              setBusy(true);
              try {
                await linkEntityToDistributor(e.id, value || null);
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="text-body text-ink-muted">Ties this customer to their account on the ordering website, so website orders can be matched to their books. Approved distributors only; the books never depend on this link.</p>
      {loadError ? <Banner tone="danger">{loadError}</Banner> : null}
      {choices === null && !loadError ? (
        <p role="status" className="flex items-center gap-2 text-body text-ink-muted">
          <Spinner /> Loading…
        </p>
      ) : (
        <Field label="Distributor" htmlFor="entity-link-distributor">
          <Select id="entity-link-distributor" value={value} onChange={(ev) => setValue(ev.target.value)}>
            <option value="">Not linked</option>
            {sorted.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.gstNumber ? ` · ${d.gstNumber}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
