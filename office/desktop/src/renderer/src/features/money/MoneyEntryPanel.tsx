import clsx from "clsx";
import { ArrowDownLeft, ArrowUpDown, ArrowUpRight, Check, Plus } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { formatINR, indiaDate, moneyEntryError, MONEY_ERROR_TEXT, rupeesToPaise, type EntityKind, type MoneyAccountRef, type MoneyErrorCode } from "@technofluid/core";
import { Button, Field, FormError, FormPanel, FormSection, IconButton, Input, MoneyInput } from "@/components/ui";
import { EntityForm } from "@/features/entities/EntityForm";
import type { EntityRow } from "@/services/entityService";
import type { EntityBalance } from "@/services/ledgerService";
import { recordMoneyEntry, type RegisterRow } from "@/services/moneyService";
import { newRequestId } from "@/services/stockService";
import { accountOptions } from "./MoneyForms";

type Side = "from" | "to";

/** One choice in a From / To picker: "R:<id>" for our cash/bank, "P:<id>" for a customer/supplier. */
interface Choice {
  key: string;
  label: string;
  group: string;
  ref: MoneyAccountRef;
  search: string;
  meta: ReactNode;
}

const GROUP_ACCOUNTS = "Your accounts";
const GROUP_PARTIES = "Customers & suppliers";

/** The plain-words version of the shared rules' refusals, for the line above Record. */
function errorText(code: MoneyErrorCode): string {
  if (code === "SAME_ACCOUNT") return "From and To must be different accounts";
  if (code === "INVALID_AMOUNT") return "Enter an amount greater than zero";
  if (code === "NOTE_TOO_LONG") return "That note is too long";
  return MONEY_ERROR_TEXT[code];
}

/**
 * The always-open "record money" form of Money in & out (Aromex's Money panel): From, a swap,
 * To, the amount, the date and a note. Any From and any To (our cash / bank, or a customer /
 * supplier) — the same choices and the same rules (core `moneyEntryError`, which the Cloud
 * Function also uses) as the Record money dialog. The whole form resets after a save.
 */
export function MoneyEntryPanel({
  parties,
  allEntities,
  registers,
  registerBalances,
  partyBalances,
  balancesLoading,
  canRecord,
  onRecorded,
}: {
  /** Customers and suppliers (active ones are offered). */
  parties: EntityRow[];
  /** Everyone, for the new-contact form's "same phone" warning. */
  allEntities: EntityRow[];
  /** Real (not placeholder) cash / bank accounts. */
  registers: RegisterRow[];
  registerBalances: Record<string, number> | null;
  partyBalances: Record<string, EntityBalance> | null;
  balancesLoading: boolean;
  canRecord: boolean;
  onRecorded: (entryId: string) => void;
}) {
  const formId = useId();
  const today = indiaDate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);
  const [adding, setAdding] = useState<{ side: Side; name: string } | null>(null);

  // A short "Recorded" after a save; it goes on the next change or after a few seconds.
  useEffect(() => {
    if (!recorded) return;
    const t = window.setTimeout(() => setRecorded(false), 5000);
    return () => window.clearTimeout(t);
  }, [recorded]);

  /** Any change: a new request (so a retry after a timeout can't record the old one twice), and clear old messages. */
  const touch = () => {
    setRecorded(false);
    setServerError(null);
    setRequestId(newRequestId());
  };

  const choices = useMemo<Choice[]>(() => {
    const { regOpts, partyOpts } = accountOptions(parties, registers);
    const regs: Choice[] = regOpts.map((o) => {
      const id = o.ref.kind === "CASH" || o.ref.kind === "BANK" ? o.ref.registerId : "";
      const bal = registerBalances ? (registerBalances[id] ?? 0) : null;
      return {
        key: o.value,
        label: o.label,
        group: GROUP_ACCOUNTS,
        ref: o.ref,
        search: o.label.toLowerCase(),
        meta: bal === null ? null : <span className={clsx("num", bal < 0 ? "text-danger" : "text-ink-muted")}>{formatINR(bal)}</span>,
      };
    });
    const byId = new Map(parties.map((p) => [p.id, p]));
    const people: Choice[] = partyOpts.map((o) => {
      const id = o.ref.kind === "PARTY" ? o.ref.entityId : "";
      const p = byId.get(id);
      const b = partyBalances?.[id];
      return {
        key: o.value,
        label: o.label,
        group: GROUP_PARTIES,
        ref: o.ref,
        search: `${o.label} ${p?.address.city ?? ""} ${p?.gstin ?? ""} ${p?.phones.join(" ") ?? ""}`.toLowerCase(),
        meta: b ? <PartyNet balance={b} /> : null,
      };
    });
    return [...regs, ...people];
  }, [parties, registers, registerBalances, partyBalances]);

  const fromChoice = choices.find((c) => c.key === from);
  const toChoice = choices.find((c) => c.key === to);
  const fromRef = fromChoice?.ref;
  const toRef = toChoice?.ref;

  let amountPaise = NaN;
  try {
    amountPaise = amount.trim() ? rupeesToPaise(amount) : NaN;
  } catch {
    amountPaise = NaN;
  }
  const amountOk = Number.isInteger(amountPaise) && amountPaise > 0 && amountPaise <= 1e13;
  const typedAmount = amount.trim().length > 0;

  // The same rules as the dialog and the Cloud Function; "enter an amount" waits until typing starts.
  const code: MoneyErrorCode | null = fromRef && toRef ? moneyEntryError({ from: fromRef, to: toRef, amountPaise, businessDay: day, note: note || null, isCorrection: false }, today) : null;
  const shownProblem =
    code && !(code === "INVALID_AMOUNT" && !typedAmount)
      ? errorText(code)
      : !(fromRef && toRef) && typedAmount && !amountOk
        ? errorText("INVALID_AMOUNT")
        : !(fromRef && toRef) && note.trim().length > 500
          ? errorText("NOTE_TOO_LONG")
          : null;
  const ready = Boolean(fromRef && toRef && !code);

  const submit = async () => {
    if (!ready || busy || !canRecord || !fromRef || !toRef) return;
    setBusy(true);
    setServerError(null);
    try {
      const { entryId } = await recordMoneyEntry({ from: fromRef, to: toRef, amountPaise, businessDay: day, note: note.trim() || null, requestId });
      setFrom("");
      setTo("");
      setAmount("");
      setNote("");
      setDay(indiaDate());
      setRequestId(newRequestId());
      setRecorded(true);
      onRecorded(entryId);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const panel = (
    <FormPanel
      aria-label="Record money"
      inert={!canRecord}
      footer={
        <>
          <p className="min-h-5 truncate text-label text-ink-muted" aria-live="polite">
            {recorded ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <Check className="size-4" aria-hidden />
                Recorded
              </span>
            ) : fromChoice && toChoice && amountOk ? (
              <span title={`${fromChoice.label} to ${toChoice.label}`}>
                <b className="font-semibold text-ink">{fromChoice.label}</b> to <b className="font-semibold text-ink">{toChoice.label}</b>
              </span>
            ) : null}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="text-title font-semibold text-ink">Amount</span>
            <span className="num min-w-0 truncate text-stat font-semibold tracking-[-0.015em] text-ink">{formatINR(amountOk ? amountPaise : 0)}</span>
          </div>
          {serverError ? <FormError>{serverError}</FormError> : shownProblem ? <FormError>{shownProblem}</FormError> : null}
          <Button
            type="submit"
            form={formId}
            variant="primary"
            className="mt-4 h-11! w-full text-title!"
            disabled={!ready || !canRecord}
            loading={busy}
            title={canRecord ? undefined : "Only someone who can manage money can record it"}
          >
            {busy ? "Recording…" : "Record"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="divide-y divide-line-row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormSection title="From and to">
          <Field label="From" htmlFor={`${formId}-from`}>
            <AccountCombo
              id={`${formId}-from`}
              choices={choices}
              value={from}
              onChange={(v) => {
                setFrom(v);
                touch();
              }}
              onCreate={(name) => setAdding({ side: "from", name })}
            />
          </Field>
          <BalanceLine choice={fromChoice} registerBalances={registerBalances} partyBalances={partyBalances} loading={balancesLoading} />
          <div className="relative my-3 flex items-center justify-center">
            <span className="absolute inset-x-0 top-1/2 border-t border-line-row" aria-hidden />
            <IconButton
              label="Swap From and To"
              variant="secondary"
              className="relative rounded-full!"
              onClick={() => {
                setFrom(to);
                setTo(from);
                touch();
              }}
            >
              <ArrowUpDown />
            </IconButton>
          </div>
          <Field label="To" htmlFor={`${formId}-to`}>
            <AccountCombo
              id={`${formId}-to`}
              choices={choices}
              value={to}
              onChange={(v) => {
                setTo(v);
                touch();
              }}
              onCreate={(name) => setAdding({ side: "to", name })}
            />
          </Field>
          <BalanceLine choice={toChoice} registerBalances={registerBalances} partyBalances={partyBalances} loading={balancesLoading} />
        </FormSection>

        <FormSection title="Amount">
          <MoneyInput
            size="lg"
            aria-label="Amount"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              touch();
            }}
            placeholder="0.00"
            invalid={typedAmount && !amountOk}
          />
        </FormSection>

        <FormSection title="Details">
          <div className="space-y-4">
            <Field label="Date" htmlFor={`${formId}-day`}>
              <div className="flex items-center gap-2">
                <Input
                  id={`${formId}-day`}
                  type="date"
                  value={day}
                  max={today}
                  onChange={(e) => {
                    setDay(e.target.value);
                    touch();
                  }}
                  className="min-w-0 flex-1"
                />
                {day !== today ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDay(today);
                      touch();
                    }}
                  >
                    Today
                  </Button>
                ) : null}
              </div>
            </Field>
            <Field label="Note" htmlFor={`${formId}-note`} optional>
              <Input
                id={`${formId}-note`}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  touch();
                }}
                placeholder="What was this for?"
                maxLength={500}
              />
            </Field>
          </div>
        </FormSection>
      </form>
    </FormPanel>
  );

  return (
    <>
      {canRecord ? (
        panel
      ) : (
        <div className="flex cursor-not-allowed" title="Only someone who can manage money can record it">
          {panel}
        </div>
      )}
      {adding ? (
        <EntityForm
          entity={null}
          all={allEntities}
          defaults={{ name: adding.name, kinds: [adding.side === "from" ? "customer" : "supplier"] as EntityKind[] }}
          onClose={(id) => {
            const side = adding.side;
            setAdding(null);
            if (!id) return;
            if (side === "from") setFrom(`P:${id}`);
            else setTo(`P:${id}`);
            touch();
          }}
        />
      ) : null}
    </>
  );
}

/** A customer's / supplier's net in a picker option: ↙ green when they owe us, ↗ red when we owe them. */
function PartyNet({ balance: b }: { balance: EntityBalance }) {
  if (b.direction === "settled" || b.balancePaise === 0) return <span className="text-ink-faint">settled</span>;
  const owesUs = b.direction === "receivable";
  return (
    <span className="num inline-flex items-center gap-1 text-ink-muted" title={owesUs ? "They owe us" : "We owe them"}>
      {formatINR(Math.abs(b.balancePaise))}
      {owesUs ? <ArrowDownLeft className="size-3.5 text-success-fill" aria-label="to receive" /> : <ArrowUpRight className="size-3.5 text-danger-fill" aria-label="to give" />}
    </span>
  );
}

/** The quiet line under a picker: what's in that account now, or where a customer/supplier stands. */
function BalanceLine({
  choice,
  registerBalances,
  partyBalances,
  loading,
}: {
  choice: Choice | undefined;
  registerBalances: Record<string, number> | null;
  partyBalances: Record<string, EntityBalance> | null;
  loading: boolean;
}) {
  const navigate = useNavigate();
  const ref = choice?.ref;
  let body: ReactNode = null;
  if (ref && (ref.kind === "CASH" || ref.kind === "BANK")) {
    const bal = registerBalances ? (registerBalances[ref.registerId] ?? 0) : null;
    body = (
      <>
        <span className={clsx("num min-w-0 truncate", bal !== null && bal < 0 ? "text-danger" : null)}>
          {bal !== null ? `Balance ${formatINR(bal)}` : loading ? "Balance loading…" : "Balance unavailable"}
        </span>
        <button type="button" onClick={() => navigate(`/payments/registers/${ref.registerId}`)} className="ml-auto shrink-0 font-medium text-accent hover:underline">
          History
        </button>
      </>
    );
  } else if (ref && ref.kind === "PARTY") {
    const b = partyBalances?.[ref.entityId];
    body = (
      <span className="num min-w-0 truncate">
        {!b
          ? partyBalances === null && loading
            ? "Balance loading…"
            : "Balance unavailable"
          : b.direction === "receivable" && b.balancePaise !== 0
            ? `owes ${formatINR(Math.abs(b.balancePaise))}`
            : b.direction === "payable" && b.balancePaise !== 0
              ? `we owe ${formatINR(Math.abs(b.balancePaise))}`
              : "settled"}
      </span>
    );
  }
  return <p className="mt-1.5 flex min-h-5 items-center gap-2 text-label text-ink-muted">{body}</p>;
}

/**
 * A type-to-find box over our accounts and customers / suppliers, in two headed groups, each
 * option with its balance at the right. ↑/↓ move, Enter picks, Esc closes; leaving with exactly
 * one match picks it. A name that isn't in the list offers "Add “name”". The list floats over
 * the page (so the panel doesn't have to scroll to show it).
 */
function AccountCombo({ id, choices, value, onChange, onCreate }: { id: string; choices: Choice[]; value: string; onChange: (key: string) => void; onCreate: (name: string) => void }) {
  const selected = choices.find((c) => c.key === value) ?? null;
  const [text, setText] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typing = useRef(false);
  const listId = `${id}-list`;

  // Show the picked name. Typing clears the pick but keeps the text; a pick cleared from
  // outside (reset, swap) clears the text too.
  useEffect(() => {
    if (selected) setText(selected.label);
    else if (!typing.current) setText("");
    typing.current = false;
  }, [value, selected?.label]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0 || (selected && selected.label === text)) return choices;
    return choices.filter((c) => words.every((w) => c.search.includes(w)));
  }, [choices, text, selected]);

  const typed = text.trim();
  const canCreate = typed.length > 0 && !selected && !choices.some((c) => c.label.trim().toLowerCase() === typed.toLowerCase());
  const optionCount = matches.length + (canCreate ? 1 : 0);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => inputRef.current && setRect(inputRef.current.getBoundingClientRect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (c: Choice) => {
    onChange(c.key);
    setText(c.label);
    setOpen(false);
  };
  const create = () => {
    setOpen(false);
    onCreate(typed);
  };
  const settle = () => {
    setOpen(false);
    if (selected || !typed) return;
    if (matches.length === 1) pick(matches[0]!);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || listRef.current?.contains(t)) return;
      settle();
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  });

  // Below the box when there's room, else above it.
  const below = rect ? window.innerHeight - rect.bottom - 8 : 0;
  const above = rect ? rect.top - 8 : 0;
  const downward = below >= 220 || below >= above;
  const maxHeight = Math.max(120, Math.min(320, downward ? below : above));

  let lastGroup = "";
  return (
    <div ref={boxRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={text}
        placeholder="Choose an account"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
          if (value) {
            typing.current = true;
            onChange("");
          }
        }}
        onBlur={() => settle()}
        onKeyDown={(e) => {
          if (e.key === "Tab") settle();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else setActive((a) => Math.min(a + 1, optionCount - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === "Enter" && open && canCreate && active === matches.length) {
            e.preventDefault();
            create();
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && rect && optionCount > 0 ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{ position: "fixed", left: rect.left, width: Math.max(rect.width, 280), maxHeight, ...(downward ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }) }}
          className="z-50 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-pop"
        >
          {matches.map((c, i) => {
            const heading = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.key} role="presentation">
                {heading ? <p className={clsx("px-2.5 pt-1.5 pb-1 text-caption font-medium text-ink-subtle", i > 0 && "mt-1 border-t border-line-row pt-2")}>{heading}</p> : null}
                <div
                  role="option"
                  data-index={i}
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={clsx("flex min-h-8 cursor-default items-center gap-3 rounded-[6px] px-2.5 py-1 text-body", i === active ? "bg-surface-alt" : null)}
                >
                  <span className="min-w-0 flex-1 truncate text-ink" title={c.label}>
                    {c.label}
                  </span>
                  {c.meta ? <span className="shrink-0 text-caption">{c.meta}</span> : null}
                </div>
              </li>
            );
          })}
          {canCreate ? (
            <li
              role="option"
              data-index={matches.length}
              aria-selected={active === matches.length}
              onMouseDown={(e) => {
                e.preventDefault();
                create();
              }}
              onMouseEnter={() => setActive(matches.length)}
              className={clsx(
                "flex min-h-8 cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1 text-body font-medium text-accent",
                matches.length > 0 && "mt-1 border-t border-line-row pt-1.5",
                active === matches.length ? "bg-surface-alt" : null,
              )}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">Add “{typed}”</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
