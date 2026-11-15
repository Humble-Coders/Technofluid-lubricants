import clsx from "clsx";
import { useMemo, useState } from "react";
import {
  correctionFor,
  formatINR,
  indiaDate,
  moneyCategory,
  MONEY_CATEGORY_LABEL,
  moneyEntryError,
  MONEY_ERROR_TEXT,
  rupeesToPaise,
  type MoneyAccountRef,
} from "@technofluid/core";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/features/entities/EntityDetail";
import type { EntityRow } from "@/services/entityService";
import { correctBalance, recordMoneyEntry, type RegisterRow } from "@/services/moneyService";

type Option = { value: string; label: string; ref: MoneyAccountRef };

/** Customers/suppliers and our cash/bank accounts, as picker options ("P:<id>" / "R:<id>"). */
export function accountOptions(parties: EntityRow[], registers: RegisterRow[]) {
  const partyOpts: Option[] = parties
    .filter((p) => p.isActive)
    .map((p) => ({ value: `P:${p.id}`, label: p.name, ref: { kind: "PARTY", entityId: p.id, name: p.name } }));
  const regOpts: Option[] = registers
    .filter((r) => r.isActive)
    .map((r) => ({ value: `R:${r.id}`, label: r.name, ref: { kind: r.kind, registerId: r.id, name: r.name } }));
  return { partyOpts, regOpts, all: [...partyOpts, ...regOpts] };
}

export function AccountPicker({
  id,
  value,
  onChange,
  parties,
  registers,
  only,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  parties: Option[];
  registers: Option[];
  /** Limit to one group. */
  only?: "parties" | "registers";
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {only !== "parties" ? (
        <optgroup label="Our cash & bank">
          {registers.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ) : null}
      {only !== "registers" ? (
        <optgroup label="Customers & suppliers">
          {parties.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ) : null}
    </Select>
  );
}

const name = (r: MoneyAccountRef | undefined) => (!r ? "…" : r.kind === "ADJUSTMENT" ? "Adjustment" : r.name);

/** "X's balance goes down by ₹A, Y's goes up by ₹A" — what an entry does, in plain words. */
export function plainWords(from: MoneyAccountRef | undefined, to: MoneyAccountRef | undefined, amount: string): string {
  if (!from || !to) return "";
  const a = amount.trim() ? `₹${amount.trim()}` : "the amount";
  if (from.kind === "PARTY" && to.kind === "PARTY") return `${from.name}'s balance goes down by ${a}, ${to.name}'s goes up by ${a}.`;
  if (from.kind === "PARTY") return `${from.name} pays ${a} into ${name(to)} — what they owe goes down.`;
  if (to.kind === "PARTY") return `${a} is paid to ${to.name} from ${name(from)} — what we owe them goes down.`;
  return `${a} moves from ${name(from)} to ${name(to)}.`;
}

/**
 * ONE form for every money movement: pick any From and any To (a customer / supplier, or
 * our cash / bank) and the entry's kind follows from the pair — money received, money
 * paid, a cash & bank transfer or a balance move — shown live before saving. Plain words,
 * never debit/credit; the Save button shows exactly what's wrong (the same rules the Cloud
 * Function uses).
 */
export function MoneyEntryForm({
  parties,
  registers,
  initial,
  onClose,
}: {
  parties: EntityRow[];
  registers: RegisterRow[];
  initial?: { from?: string; to?: string };
  onClose: (savedEntryId: string | null) => void;
}) {
  const opts = useMemo(() => accountOptions(parties, registers), [parties, registers]);
  const [from, setFrom] = useState(initial?.from ?? "");
  const [to, setTo] = useState(initial?.to ?? "");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(indiaDate());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromRef = opts.all.find((o) => o.value === from)?.ref;
  const toRef = opts.all.find((o) => o.value === to)?.ref;
  let amountPaise = NaN;
  try {
    amountPaise = amount.trim() ? rupeesToPaise(amount) : NaN;
  } catch {
    amountPaise = NaN;
  }
  const problem =
    !fromRef || !toRef
      ? "Choose From and To."
      : (() => {
          const code = moneyEntryError({ from: fromRef, to: toRef, amountPaise, businessDay: day, note: note || null, isCorrection: false }, indiaDate());
          return code ? MONEY_ERROR_TEXT[code] : null;
        })();

  const save = async () => {
    if (problem || !fromRef || !toRef) return;
    setBusy(true);
    setError(null);
    try {
      const { entryId } = await recordMoneyEntry({ from: fromRef, to: toRef, amountPaise, businessDay: day, note: note.trim() || null });
      onClose(entryId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Record money in or out" onClose={() => onClose(null)} busy={busy}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="me-from">
          <AccountPicker id="me-from" value={from} onChange={setFrom} parties={opts.partyOpts} registers={opts.regOpts} />
        </Field>
        <Field label="To" htmlFor="me-to">
          <AccountPicker id="me-to" value={to} onChange={setTo} parties={opts.partyOpts} registers={opts.regOpts} />
        </Field>
        <Field label="Amount (₹)" htmlFor="me-amount">
          <Input id="me-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="10000" className="num" autoFocus />
        </Field>
        <Field label="Day" htmlFor="me-day">
          <Input id="me-day" type="date" value={day} max={indiaDate()} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>
      <Field label="Note" htmlFor="me-note">
        <Input id="me-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — e.g. cheque no." maxLength={500} />
      </Field>
      {fromRef && toRef ? (
        <p className="rounded-md bg-canvas px-3 py-2 text-[13px] text-ink">
          <Badge tone="brand" className="mr-2">
            {MONEY_CATEGORY_LABEL[moneyCategory({ from: fromRef, to: toRef })]}
          </Badge>
          {plainWords(fromRef, toRef, amount)}
        </p>
      ) : (
        <p className="text-[12px] text-ink-muted">From and To can each be a customer / supplier or our cash / bank — money received, money paid, a transfer between our accounts, or a balance moved between two parties.</p>
      )}
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        {problem ? <span className="mr-auto text-[12px] text-ink-muted">{problem}</span> : null}
        <Button variant="ghost" onClick={() => onClose(null)} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={busy} disabled={Boolean(problem)}>
          Save
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Admin: "this balance should be ₹X". Shows the entry it will make (computed the same way
 * the server does — the server reads the balance from the books again and decides).
 */
export function CorrectionDialog({
  parties,
  registers,
  partyBalances,
  registerBalances,
  initialTarget,
  onClose,
}: {
  parties: EntityRow[];
  registers: RegisterRow[];
  partyBalances: Record<string, { balancePaise: number }> | null;
  registerBalances: Record<string, number> | null;
  initialTarget?: string;
  onClose: (savedEntryId: string | null) => void;
}) {
  const opts = useMemo(() => accountOptions(parties, registers), [parties, registers]);
  const [target, setTarget] = useState(initialTarget ?? "");
  const [wanted, setWanted] = useState("");
  const [owedBy, setOwedBy] = useState<"them" | "us">("them");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ref = opts.all.find((o) => o.value === target)?.ref;
  const isParty = ref?.kind === "PARTY";
  const current = !ref ? null : ref.kind === "PARTY" ? (partyBalances?.[ref.entityId]?.balancePaise ?? null) : ref.kind === "CASH" || ref.kind === "BANK" ? (registerBalances?.[ref.registerId] ?? null) : null;
  let wantedSigned: number | null = null;
  try {
    const p = wanted.trim() ? rupeesToPaise(wanted) : NaN;
    wantedSigned = Number.isNaN(p) ? null : isParty && owedBy === "us" ? -Math.abs(p) : isParty ? Math.abs(p) : p;
  } catch {
    wantedSigned = null;
  }
  const draft = ref && current !== null && wantedSigned !== null && ref.kind !== "ADJUSTMENT" && ref.kind !== "EXPENSE" ? correctionFor(ref, current, wantedSigned) : null;
  const describe = (p: number) => (isParty ? (p > 0 ? `${formatINR(p)} they owe us` : p < 0 ? `${formatINR(-p)} we owe them` : "settled") : formatINR(p));

  const save = async () => {
    if (!ref || wantedSigned === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await correctBalance(ref, wantedSigned, indiaDate(), reason);
      if (r.noChange) {
        setDone("Already right — nothing was recorded.");
        setBusy(false);
      } else onClose(r.entryId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Correct a balance" onClose={() => onClose(null)} busy={busy}>
      <Field label="Whose balance" htmlFor="cb-target">
        <AccountPicker id="cb-target" value={target} onChange={setTarget} parties={opts.partyOpts} registers={opts.regOpts} />
      </Field>
      {ref ? (
        <p className="text-[12px] text-ink-muted">Now in the books: {current === null ? "— (books unreachable or not saved yet)" : describe(current)}</p>
      ) : null}
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field label="It should be (₹)" htmlFor="cb-wanted">
          <Input id="cb-wanted" value={wanted} onChange={(e) => setWanted(e.target.value)} inputMode="decimal" className="num" placeholder="0" />
        </Field>
        {isParty ? (
          <Select value={owedBy} onChange={(e) => setOwedBy(e.target.value as "them" | "us")} aria-label="Who owes" className="w-40">
            <option value="them">they owe us</option>
            <option value="us">we owe them</option>
          </Select>
        ) : null}
      </div>
      <Field label="Reason" htmlFor="cb-reason">
        <Input id="cb-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required — e.g. matches the paper ledger" maxLength={500} />
      </Field>
      {draft ? (
        <p className="rounded-md bg-canvas px-3 py-2 text-[13px] text-ink">
          This records a correction of <b>{formatINR(draft.amountPaise)}</b>:{" "}
          {draft.from.kind === "ADJUSTMENT" ? `${name(draft.to)} goes up` : `${name(draft.from)} goes down`} — to {describe(wantedSigned!)}.
        </p>
      ) : ref && current !== null && wantedSigned !== null ? (
        <p className="text-[12px] text-success">It's already {describe(current)} — nothing to correct.</p>
      ) : null}
      {done ? <p className="text-[12px] text-success">{done}</p> : null}
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onClose(null)} disabled={busy}>
          {done ? "Close" : "Cancel"}
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!draft || !reason.trim() || Boolean(done)}>
          Record correction
        </Button>
      </div>
    </Modal>
  );
}

export const amountClass = (dir: "IN" | "OUT" | "INTERNAL") => clsx("num font-semibold", dir === "IN" ? "text-success" : dir === "OUT" ? "text-danger" : "text-ink");
