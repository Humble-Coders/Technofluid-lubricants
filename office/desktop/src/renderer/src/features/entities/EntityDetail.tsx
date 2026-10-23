import clsx from "clsx";
import { Archive, ArchiveRestore, History, Link2, Pencil, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatINR, GST_STATES, indiaDate } from "@technofluid/core";
import { Badge, Button, Input, Segmented, Select, Spinner } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { useEntityHistory, useEntityStatement } from "@/hooks/useEntities";
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
  const [tab, setTab] = useState<"statement" | "history">("statement");
  const [archiving, setArchiving] = useState(false);
  const [linking, setLinking] = useState(false);
  const state = e.address.stateCode ? GST_STATES[e.address.stateCode] : null;

  return (
    <aside className="flex w-[440px] shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{e.name}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
            {e.kinds.map((k) => (
              <Badge key={k} tone={k === "customer" ? "info" : "brand"}>
                {k === "customer" ? "Customer" : "Supplier"}
              </Badge>
            ))}
            {e.isWalkIn ? <Badge>Walk-in</Badge> : null}
            {!e.isActive ? <Badge>Archived</Badge> : null}
          </p>
        </div>
        <Button size="sm" onClick={onEdit} icon={<Pencil className="size-3.5" />}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="px-1.5" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section>
          <p className="text-2xs font-medium tracking-wide text-ink-muted uppercase">Balance</p>
          {booksError ? (
            <p className="text-[13px] text-warning">— books unreachable</p>
          ) : e.syncStatus !== "SYNCED" && !balance ? (
            <p className="text-[13px] text-ink-muted">— not in the books yet</p>
          ) : (
            <p className="flex items-baseline gap-2">
              <BalanceText balance={balance ?? { balancePaise: 0, direction: "settled" }} className="text-[22px]" />
              {balance && balance.direction !== "settled" ? (
                <span className="text-[12px] text-ink-muted">{balance.direction === "receivable" ? "they owe us" : "we owe them"}</span>
              ) : null}
            </p>
          )}
          {e.creditLimitPaise !== null ? (
            <p className={clsx("text-[12px]", balance && balance.balancePaise > e.creditLimitPaise ? "text-warning" : "text-ink-muted")}>
              Credit limit {formatINR(e.creditLimitPaise)}
              {balance && balance.balancePaise > e.creditLimitPaise ? " — over the limit" : ""}
            </p>
          ) : null}
          <SyncLine entity={e} />
        </section>

        <section className="space-y-1.5 text-[13px]">
          <Row label="Phone">{e.phones.join(", ") || "—"}</Row>
          <Row label="Email">{e.email ?? "—"}</Row>
          <Row label="GSTIN">
            {e.gstin ? (
              <span className="font-mono">
                {e.gstin}
                {e.gstVerified ? <span className="ml-1.5 font-sans text-[12px] text-success">verified</span> : null}
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Address">{[e.address.line1, e.address.line2, e.address.city, e.address.district, e.address.pincode].filter(Boolean).join(", ") || "—"}</Row>
          <Row label="State">{state ? `${state} (${e.address.stateCode})` : <span className="text-warning">Needed — edit to choose it</span>}</Row>
          {e.kinds.includes("customer") ? (
            <Row label="Price list">{e.priceTier ?? <span className="text-warning">Not chosen — Sales can't bill until it is</span>}</Row>
          ) : null}
          <Row label="Opening balance">
            {e.opening ? `${formatINR(e.opening.amountPaise)} ${e.opening.direction === "receivable" ? "they owed us" : "we owed them"} on ${e.opening.asOf}` : "—"}
          </Row>
          <Row label="Website distributor">
            {e.distributorId ? <span className="font-mono text-[12px]">{e.distributorId}</span> : "—"}
            {isAdmin && !e.isWalkIn ? (
              <button type="button" className="ml-2 text-[12px] font-medium text-info hover:underline" onClick={() => setLinking(true)}>
                {e.distributorId ? "Change" : "Link"}
              </button>
            ) : null}
          </Row>
          {e.notes ? <Row label="Notes">{e.notes}</Row> : null}
          {e.importNotes.length ? (
            <div className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">{e.importNotes.join(" · ")}</div>
          ) : null}
        </section>

        <div className="flex flex-wrap gap-2">
          {!e.isWalkIn ? (
            <Button size="sm" icon={e.isActive ? <Archive className="size-3.5" /> : <ArchiveRestore className="size-3.5" />} onClick={() => setArchiving(true)}>
              {e.isActive ? "Archive" : "Un-archive"}
            </Button>
          ) : null}
        </div>

        <section>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              ["statement", "Statement"],
              ["history", "History"],
            ]}
          />
          <div className="mt-3">{tab === "statement" ? <StatementView entity={e} /> : <HistoryView entityId={e.id} />}</div>
        </section>
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
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <span className="min-w-0 text-ink">{children}</span>
    </div>
  );
}

function SyncLine({ entity: e }: { entity: EntityRow }) {
  const [busy, setBusy] = useState(false);
  if (e.syncStatus === "SYNCED") return null;
  if (e.syncStatus === "PENDING") return <p className="mt-1 text-[12px] text-ink-muted">Saving to the books…</p>;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-danger">
      Couldn't save to the books{e.hlSyncError ? `: ${e.hlSyncError}` : "."}
      <Button size="sm" loading={busy} icon={<RefreshCw className="size-3.5" />} onClick={() => {
        setBusy(true);
        void retryEntitySync(e.id).finally(() => setBusy(false));
      }}>
        Retry
      </Button>
    </p>
  );
}

function StatementView({ entity: e }: { entity: EntityRow }) {
  const today = indiaDate();
  const [from, setFrom] = useState(e.opening?.asOf && e.opening.asOf < fyStart(today) ? e.opening.asOf : fyStart(today));
  const [to, setTo] = useState(today);
  const inBooks = e.syncStatus === "SYNCED" || e.opening?.posted === true;
  const { state, retry } = useEntityStatement(e.id, from, to, inBooks);

  if (!inBooks) return <p className="text-[12px] text-ink-muted">The statement shows once it's saved to the books.</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <Input type="date" value={from} max={to} onChange={(ev) => ev.target.value && setFrom(ev.target.value)} aria-label="From" className="w-36" />
        <span>–</span>
        <Input type="date" value={to} min={from} onChange={(ev) => ev.target.value && setTo(ev.target.value)} aria-label="To" className="w-36" />
      </div>
      {state.status === "loading" ? (
        <Spinner />
      ) : state.status === "error" ? (
        <p className="flex flex-wrap items-center gap-2 text-[12px] text-warning">
          {state.message}
          <Button size="sm" onClick={retry} icon={<RefreshCw className="size-3.5" />}>
            Retry
          </Button>
        </p>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-2 font-medium">Date</th>
              <th className="py-1.5 pr-2 font-medium">What</th>
              <th className="py-1.5 pr-2 text-right font-medium">Debit</th>
              <th className="py-1.5 pr-2 text-right font-medium">Credit</th>
              <th className="py-1.5 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line/70 text-ink-muted">
              <td className="py-1.5 pr-2">{state.data.from}</td>
              <td className="py-1.5 pr-2">Brought forward</td>
              <td />
              <td />
              <td className="num py-1.5 text-right">{formatINR(state.data.openingPaise)}</td>
            </tr>
            {state.data.rows.map((r) => (
              <tr key={r.txnIds.join("-")} className="border-b border-line/70">
                <td className="py-1.5 pr-2 whitespace-nowrap">{r.date}</td>
                <td className="py-1.5 pr-2">{r.what}</td>
                <td className="num py-1.5 pr-2 text-right">{r.debitPaise ? formatINR(r.debitPaise) : ""}</td>
                <td className="num py-1.5 pr-2 text-right">{r.creditPaise ? formatINR(r.creditPaise) : ""}</td>
                <td className={clsx("num py-1.5 text-right font-medium", r.balancePaise < 0 ? "text-danger" : "text-ink")}>{formatINR(r.balancePaise)}</td>
              </tr>
            ))}
            {state.data.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-2 text-ink-muted">
                  Nothing in these dates.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HistoryView({ entityId }: { entityId: string }) {
  const history = useEntityHistory(entityId);
  if (history.status === "loading") return <Spinner />;
  if (history.status === "error") return <p className="text-[12px] text-danger">{history.message}</p>;
  if (history.data.length === 0) return <p className="text-[12px] text-ink-muted">No changes yet.</p>;
  const ACTION: Record<string, string> = { create: "Added", edit: "Edited", archive: "Archived", unarchive: "Un-archived", link: "Linked", unlink: "Unlinked" };
  return (
    <ol className="space-y-2">
      {history.data.map((h) => (
        <li key={h.id} className="rounded bg-canvas px-2.5 py-1.5 text-[12px]">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            <History className="size-3.5 text-ink-faint" /> {ACTION[h.action] ?? h.action}
            {h.reason ? <span className="font-normal text-ink-muted">— “{h.reason}”</span> : null}
          </p>
          {Object.entries(h.changes).map(([f, c]) => (
            <p key={f} className="text-ink">
              <span className="text-ink-muted">{FIELD_LABEL[f] ?? f}:</span>{" "}
              <span className="text-ink-muted line-through decoration-ink-faint">{show(f, c.from)}</span> → {show(f, c.to)}
            </p>
          ))}
          <p className="text-2xs text-ink-faint">
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
    <Modal title={`${archive ? "Archive" : "Un-archive"} ${e.name}`} onClose={() => onClose(false)} busy={busy}>
      <p className="text-[12px] text-ink-muted">
        {archive ? "Only a zero balance can be archived — it's archived in the books too." : "It shows in the lists again, and in the books."}
      </p>
      <Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Reason" autoFocus maxLength={300} aria-label="Reason" />
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
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
      </div>
    </Modal>
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
    <Modal title={`Link ${e.name} to a website distributor`} onClose={onClose} busy={busy}>
      <p className="text-[12px] text-ink-muted">Approved distributors only. The books never depend on this link.</p>
      {loadError ? <p className="text-[12px] text-danger">{loadError}</p> : null}
      {choices === null && !loadError ? (
        <Spinner />
      ) : (
        <Select value={value} onChange={(ev) => setValue(ev.target.value)} aria-label="Distributor">
          <option value="">Not linked</option>
          {sorted.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.gstNumber ? ` · ${d.gstNumber}` : ""}
            </option>
          ))}
        </Select>
      )}
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={busy}
          icon={<Link2 className="size-3.5" />}
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
      </div>
    </Modal>
  );
}

export function Modal({ title, onClose, busy, children, wide }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className={clsx("w-full space-y-3 rounded-xl bg-surface p-5 shadow-pop", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-[15px] font-semibold text-ink">{title}</h2>
          <Button variant="ghost" size="sm" className="px-1.5" aria-label="Close" onClick={onClose} disabled={busy}>
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
