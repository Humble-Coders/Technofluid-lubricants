import { CircleCheck, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { MAIN_LINE, companyFormErrors, companyPeriod, companyPeriodIn, indiaDate, nextYearDates, prettyDay } from "@technofluid/core";
import { Banner, Button, Checkbox, Dialog, Field, FormError, Input, Segmented, Select } from "@/components/ui";
import { companyRequestId, createCompany, type CompanyDetails, type CompanyRow, type Copied } from "@/services/companyService";
import { CloseYearDialog, CompanyDetailsFields } from "./CompanyPanel";

export type CompanyFormMode = { kind: "add" } | { kind: "newYear"; source: CompanyRow };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Add company (Tally "Create Company" with Busy-style "copy masters"), and the New financial
 * year shortcut — the same form with the same name, the next year's dates and everything
 * ticked. Carrying balances needs the old year closed first; the form says so and offers
 * Close year right here.
 */
export function CompanyFormDialog({ mode, companies, onClose, onCreated }: { mode: CompanyFormMode; companies: CompanyRow[]; onClose: () => void; onCreated: (companyId: string) => void }) {
  const today = indiaDate();
  const newYear = mode.kind === "newYear" ? mode.source : null;
  const dates = newYear ? nextYearDates(newYear, today) : null;
  const usable = companies.filter((c) => !c.accessLost);

  const [requestId] = useState(companyRequestId);
  const [name, setName] = useState(newYear?.name ?? "");
  const [details, setDetails] = useState<CompanyDetails>(newYear?.details ?? {});
  const [fyStartMonth, setFyStartMonth] = useState(newYear?.fyStartMonth ?? 4);
  const [booksBeginFrom, setBooksBeginFrom] = useState(dates?.booksBeginFrom ?? "");
  const [sourceId, setSourceId] = useState(newYear?.id ?? "");
  const [copy, setCopy] = useState({ accounts: Boolean(newYear), customers: Boolean(newYear), vendors: Boolean(newYear), members: Boolean(newYear) });
  const [carry, setCarry] = useState(Boolean(newYear));
  const [asOf, setAsOf] = useState(dates?.asOf ?? "");
  const [pendingBills, setPendingBills] = useState<"ITEMIZED" | "TOTAL">("ITEMIZED");
  const [joinsMain, setJoinsMain] = useState(newYear ? newYear.line === MAIN_LINE : false);
  const [lineFrom, setLineFrom] = useState(dates?.booksBeginFrom ?? "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closingSource, setClosingSource] = useState(false);
  const [done, setDone] = useState<{ companyId: string; copied: Copied | null } | null>(null);

  const source = usable.find((c) => c.id === sourceId) ?? null;
  // A new year of a money-only company simply continues that company's books.
  const continuesPerson = Boolean(newYear && newYear.line !== MAIN_LINE);
  const copying = Boolean(source) && (copy.accounts || copy.customers || copy.vendors || copy.members || carry);
  const sourceClosed = Boolean(source?.lockedThrough && asOf && source.lockedThrough >= asOf);
  const errors = useMemo(
    () => companyFormErrors({ name, booksBeginFrom, carry: Boolean(source) && carry, asOf, joinsMain, lineFrom }),
    [name, booksBeginFrom, source, carry, asOf, joinsMain, lineFrom],
  );
  const shown = tried ? errors : {};
  const set = (k: keyof CompanyDetails) => (e: { target: { value: string } }) => setDetails((d) => ({ ...d, [k]: e.target.value }));

  const submit = async () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    if (source && carry && !sourceClosed) return setError(`Close ${source.name} up to ${prettyDay(asOf)} first.`);
    setBusy(true);
    setError(null);
    try {
      const joinsLine = continuesPerson ? "source" : joinsMain ? "main" : "none";
      const r = await createCompany(
        {
          name,
          fyStartMonth,
          booksBeginFrom: booksBeginFrom || null,
          details,
          copyFrom: copying && source ? { companyId: source.id, ...copy, carry: carry ? { asOf, pendingBills } : null } : null,
          joinsLine,
          lineFrom: joinsLine === "none" ? null : lineFrom || booksBeginFrom || null,
        },
        requestId,
      );
      setDone({ companyId: r.companyId, copied: r.copied });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) return <CreatedDialog name={name} copied={done.copied} onClose={() => (onCreated(done.companyId), onClose())} />;

  return (
    <Dialog
      title={newYear ? "New financial year" : "Add company"}
      subtitle={newYear ? `Continues ${newYear.name} (${companyPeriodIn(newYear, companies)})` : "A separate set of books in Humble Ledger"}
      onClose={onClose}
      busy={busy}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Create company
          </Button>
        </>
      }
    >
      <CompanyDetailsFields name={name} onName={setName} details={details} set={set} nameError={shown.name} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Financial year starts in" htmlFor="co-fy">
          <Select id="co-fy" value={fyStartMonth} onChange={(e) => setFyStartMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Books begin" htmlFor="co-begin" optional={!carry} error={shown.booksBeginFrom} help="Nothing can be dated before this day.">
          <Input id="co-begin" type="date" value={booksBeginFrom} onChange={(e) => setBooksBeginFrom(e.target.value)} invalid={Boolean(shown.booksBeginFrom)} />
        </Field>
      </div>

      <section className="space-y-3 border-t border-line-row pt-4">
        <h3 className="text-body font-semibold text-ink">Copy from another company</h3>
        {newYear ? null : (
          <Field label="Copy from" htmlFor="co-source">
            <Select id="co-source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Nothing — start with empty books</option>
              {usable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({companyPeriodIn(c, companies)})
                </option>
              ))}
            </Select>
          </Field>
        )}
        {source ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Checkbox label="Ledger accounts (cash, bank, expenses…)" checked={copy.accounts} onChange={(e) => setCopy((c) => ({ ...c, accounts: e.target.checked }))} />
              <Checkbox label="Customers" checked={copy.customers} onChange={(e) => setCopy((c) => ({ ...c, customers: e.target.checked }))} />
              <Checkbox label="Suppliers" checked={copy.vendors} onChange={(e) => setCopy((c) => ({ ...c, vendors: e.target.checked }))} />
              <Checkbox label="Staff logins" checked={copy.members} onChange={(e) => setCopy((c) => ({ ...c, members: e.target.checked }))} />
            </div>
            <p className="text-caption text-ink-subtle">Products, prices and stock are shared by every company, so they don't need copying.</p>

            <div className="space-y-3 rounded-control bg-surface-alt p-3">
              <Checkbox label={<span className="font-medium">Carry closing balances forward</span>} checked={carry} onChange={(e) => setCarry(e.target.checked)} />
              {carry ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Closing balances as of" htmlFor="co-asof" error={shown.asOf}>
                      <Input id="co-asof" type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value)} invalid={Boolean(shown.asOf)} />
                    </Field>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-label font-medium text-ink">Unpaid bills come across</span>
                      <Segmented
                        wide
                        value={pendingBills}
                        onChange={setPendingBills}
                        options={[
                          ["ITEMIZED", "Each bill"],
                          ["TOTAL", "One total per party"],
                        ]}
                      />
                    </div>
                  </div>
                  <p className="text-caption text-ink-subtle">
                    {pendingBills === "ITEMIZED" ? "Every unpaid bill keeps its number, date and due date in the new books." : "Each customer and supplier comes across with one balance."} Cash, bank and every other balance come across as opening balances; the year's profit goes to Retained Earnings.
                  </p>
                  {asOf && !sourceClosed ? (
                    <Banner tone="warning" action={<Button size="sm" icon={<Lock />} onClick={() => setClosingSource(true)}>Close year</Button>}>
                      {source.name} must be closed up to {prettyDay(asOf)} before its balances can be carried
                      {source.lockedThrough ? ` (closed up to ${prettyDay(source.lockedThrough)} now)` : ""}.
                    </Banner>
                  ) : null}
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      <section className="space-y-3 border-t border-line-row pt-4">
        <h3 className="text-body font-semibold text-ink">What this company keeps</h3>
        {continuesPerson && newYear ? (
          <p className="text-body text-ink">
            Continues {newYear.name}'s books (money only) from {lineFrom || booksBeginFrom ? prettyDay(lineFrom || booksBeginFrom) : "the day its books begin"}.
          </p>
        ) : (
          <>
            <Checkbox label={<span className="font-medium">Make this the main business company</span>} checked={joinsMain} onChange={(e) => setJoinsMain(e.target.checked)} />
            {joinsMain ? (
              <Field label="From" htmlFor="co-linefrom" error={shown.lineFrom} help="From this day, new sales, purchases and website orders go to this company. Stock stays one continuous stock.">
                <Input id="co-linefrom" type="date" value={lineFrom || booksBeginFrom} onChange={(e) => setLineFrom(e.target.value)} className="w-44" invalid={Boolean(shown.lineFrom)} />
              </Field>
            ) : (
              <p className="text-label text-ink-muted">A separate, money-only set of books (payments, receipts, expenses, transfers) — for example for a person in the business.</p>
            )}
          </>
        )}
      </section>

      {error ? <FormError>{error}</FormError> : null}

      {closingSource && source ? <CloseYearDialog company={source} defaultDate={asOf} onClose={() => setClosingSource(false)} /> : null}
    </Dialog>
  );
}

function CreatedDialog({ name, copied, onClose }: { name: string; copied: Copied | null; onClose: () => void }) {
  const parts = copied
    ? [
        [copied.accounts, "ledger account"],
        [copied.customers, "customer"],
        [copied.vendors, "supplier"],
        [copied.members, "staff login"],
        [copied.openingBalanceLines, "opening balance"],
        [copied.pendingBills, "unpaid customer bill"],
        [copied.pendingSupplierBills, "unpaid supplier bill"],
      ].filter(([n]) => Number(n) > 0)
    : [];
  return (
    <Dialog
      title="Company created"
      onClose={onClose}
      size="md"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="flex items-start gap-2 text-body text-ink">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>{name} is ready in Humble Ledger.</span>
      </p>
      {parts.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-body text-ink">
          {parts.map(([n, label]) => (
            <li key={String(label)} className="num">
              {Number(n).toLocaleString("en-IN")} {label}
              {Number(n) === 1 ? "" : "s"} copied
            </li>
          ))}
        </ul>
      ) : copied ? (
        <p className="text-label text-ink-muted">Nothing needed copying — the other company's books were empty.</p>
      ) : (
        <p className="text-label text-ink-muted">It starts with empty books (Humble Ledger adds its standard accounts).</p>
      )}
    </Dialog>
  );
}
