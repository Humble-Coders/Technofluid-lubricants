import { ArrowRightLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { companyPeriodIn, formatINR, indiaDate, rupeesToPaise } from "@technofluid/core";
import { Button, Dialog, Field, FormError, Input, MoneyInput, Select } from "@/components/ui";
import { useCompany } from "@/features/companies/CompanyContext";
import { newRequestId } from "@/services/stockService";
import { recordCompanyTransfer, watchRegistersOfLine, type RegisterRow } from "@/services/moneyService";

/**
 * Money between companies (Admin): from this company's cash / bank into another company's.
 * Entered once; the app records it in both companies' books, each against its account with
 * the other (Tally posts it in both the same way). Reversing either half reverses both.
 */
export function CompanyTransferDialog({ registers, onClose, onSaved }: { registers: RegisterRow[]; onClose: () => void; onSaved: (entryId: string) => void }) {
  const { company, companies } = useCompany();
  const today = indiaDate();
  const others = useMemo(() => companies.filter((c) => c.line !== company?.line && !c.archived && !c.accessLost), [companies, company]);
  const [requestId] = useState(newRequestId);
  const [fromId, setFromId] = useState(registers.find((r) => !r.placeholder && r.isActive)?.id ?? "");
  const [toCompanyId, setToCompanyId] = useState(others[0]?.id ?? "");
  const toCompany = others.find((c) => c.id === toCompanyId) ?? null;
  const [theirs, setTheirs] = useState<RegisterRow[]>([]);
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!toCompany) return setTheirs([]);
    return watchRegistersOfLine(toCompany.line, (rows) => {
      setTheirs(rows);
      setToId((cur) => (rows.some((r) => r.id === cur) ? cur : rows[0]?.id ?? ""));
    }, () => setTheirs([]));
  }, [toCompany]);

  let paise: number | null = null;
  try {
    paise = amount.trim() ? rupeesToPaise(amount) : null;
  } catch {
    paise = null;
  }
  const mine = registers.filter((r) => !r.placeholder && r.isActive);

  const submit = async () => {
    if (!fromId) return setError("Pick the cash or bank account the money leaves.");
    if (!toCompany) return setError("Pick the company it goes to.");
    if (!toId) return setError(`${toCompany.name} has no cash or bank account yet — add one there first.`);
    if (!paise || paise <= 0) return setError("Enter an amount above ₹0.");
    setBusy(true);
    setError(null);
    try {
      const r = await recordCompanyTransfer({ requestId, toCompanyId: toCompany.id, fromRegisterId: fromId, toRegisterId: toId, amountPaise: paise, businessDay: day, note: note.trim() || null });
      onSaved(r.entryId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Move money to another company"
      subtitle={company ? `From ${company.name}` : undefined}
      onClose={onClose}
      busy={busy}
      size="md"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon={<ArrowRightLeft />} loading={busy} onClick={() => void submit()}>
            {paise ? `Move ${formatINR(paise)}` : "Move money"}
          </Button>
        </>
      }
    >
      {others.length === 0 ? (
        <p className="text-body text-ink">There's no other company to move money to. Add one in Companies first.</p>
      ) : (
        <>
          <Field label="From (this company)" htmlFor="ct-from">
            <Select id="ct-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {mine.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="To company" htmlFor="ct-co">
              <Select id="ct-co" value={toCompanyId} onChange={(e) => setToCompanyId(e.target.value)}>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {companyPeriodIn(c, companies)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Into" htmlFor="ct-to" help={toCompany && !theirs.length ? "No cash or bank account there yet." : undefined}>
              <Select id="ct-to" value={toId} onChange={(e) => setToId(e.target.value)} disabled={!theirs.length}>
                {theirs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" htmlFor="ct-amt">
              <MoneyInput id="ct-amt" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Date" htmlFor="ct-day">
              <Input id="ct-day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
            </Field>
          </div>
          <Field label="Note" htmlFor="ct-note" optional>
            <Input id="ct-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Capital for the new shop" />
          </Field>
          <p className="text-caption text-ink-subtle">Recorded in both companies: here against an account with {toCompany?.name ?? "the other company"}, and there against an account with this company.</p>
        </>
      )}
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  );
}
