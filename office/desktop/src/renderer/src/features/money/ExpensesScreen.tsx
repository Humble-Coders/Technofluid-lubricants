import { Plus, Receipt, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  checkGstin,
  expenseGstSplit,
  formatINR,
  GST_STATES,
  indiaDate,
  isCancelled,
  moneyEntryError,
  MONEY_ERROR_TEXT,
  rupeesToPaise,
  type ExpenseGst,
  type MoneyAccountRef,
} from "@technofluid/core";
import { Button, EmptyState, Field, Input, Segmented, Select, Spinner } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { Modal } from "@/features/entities/EntityDetail";
import { useEntities } from "@/hooks/useEntities";
import { useCategories, useMoneyEntries, useRegisters } from "@/hooks/useMoney";
import { recordExpense, saveExpenseCategory, type CategoryRow, type RegisterRow } from "@/services/moneyService";
import type { EntityRow } from "@/services/entityService";
import { EntriesTable, rangeFor } from "./MoneyScreen";

const STATES = Object.entries(GST_STATES).sort((a, b) => a[1].localeCompare(b[1]));
const RATES = [0, 500, 1200, 1800, 2800, 4000];

/**
 * Expenses (Admin, Accounts): freight, electricity, salaries… paid from cash or a bank,
 * with GST input credit when there's a GST bill. Shown as "Expense" (in red), never as a
 * transfer; reversible like any entry.
 */
export function ExpensesScreen() {
  const { role } = useStaff();
  const today = indiaDate();
  const categories = useCategories();
  const cats = useMemo(() => (categories.status === "ready" ? categories.data : []), [categories]);
  const registers = useRegisters();
  const regs = useMemo(() => (registers.status === "ready" ? registers.data.filter((r) => r.isActive && !r.placeholder) : []), [registers]);
  const entities = useEntities();
  const suppliers = useMemo(() => (entities.status === "ready" ? entities.data.filter((e) => e.isActive && e.gstin) : []), [entities]);
  const [preset, setPreset] = useState<"today" | "week" | "month">("month");
  const [from, to] = rangeFor(preset, today);
  const entries = useMoneyEntries(from, to);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    if (entries.status !== "ready") return [];
    const words = search.trim().toLowerCase();
    return entries.data.filter((e) => {
      const exp = e.to.kind === "EXPENSE" ? e.to : e.from.kind === "EXPENSE" ? e.from : null;
      if (!exp) return false;
      if (category && exp.categoryId !== category) return false;
      if (words && ![exp.name, e.note ?? "", e.gst?.supplier.name ?? "", e.gst?.billNo ?? ""].join(" ").toLowerCase().includes(words)) return false;
      return true;
    });
  }, [entries, search, category]);

  const totals = useMemo(() => {
    const t = new Map<string, number>();
    for (const e of rows) {
      // The original counts until its reversal is in the books; the mirror itself never does.
      if (e.reversesEntryId || isCancelled(e, e.mirrorStatus)) continue;
      if (e.to.kind !== "EXPENSE") continue;
      t.set(e.to.name, (t.get(e.to.name) ?? 0) + e.amountPaise);
    }
    return [...t.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" leading={<Search className="size-3.5" />} className="w-56" aria-label="Search expenses" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="w-48">
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)} aria-label="Dates" className="w-36">
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">This month</option>
          </Select>
          <span className="flex-1" />
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
            Add expense
          </Button>
        </div>
        {totals.length ? (
          <div className="flex flex-wrap gap-2">
            {totals.map(([name, paise]) => (
              <span key={name} className="rounded-md bg-canvas px-3 py-1.5 text-[12px]">
                {name} <span className="num font-semibold text-danger">{formatINR(paise)}</span>
              </span>
            ))}
          </div>
        ) : null}
        {entries.status === "loading" ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Receipt className="size-6" />} title="No expenses in these dates" />
        ) : (
          <EntriesTable rows={rows} isAdmin={role === "admin"} />
        )}
      </div>
      {adding ? <ExpenseForm categories={cats} registers={regs} suppliers={suppliers} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function ExpenseForm({ categories, registers, suppliers, onClose }: { categories: CategoryRow[]; registers: RegisterRow[]; suppliers: EntityRow[]; onClose: () => void }) {
  const [categoryId, setCategoryId] = useState(categories.find((c) => c.isActive)?.id ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [registerId, setRegisterId] = useState(registers[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(indiaDate());
  const [note, setNote] = useState("");
  const [gstOn, setGstOn] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [supName, setSupName] = useState("");
  const [supGstin, setSupGstin] = useState("");
  const [supState, setSupState] = useState("06");
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(indiaDate());
  const [rateBp, setRateBp] = useState(1800);
  const [enterAs, setEnterAs] = useState<"total" | "taxable">("total");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = registers.find((r) => r.id === registerId);
  const category = categories.find((c) => c.id === categoryId);
  const supplier = suppliers.find((s) => s.id === supplierId);
  const gstin = supplier?.gstin ?? supGstin.trim().toUpperCase();
  const gstinCheck = gstin ? checkGstin(gstin) : null;
  const stateCode = supplier?.address.stateCode ?? (gstinCheck?.valid ? gstinCheck.stateCode : supState);

  let typed = NaN;
  try {
    typed = amount.trim() ? rupeesToPaise(amount) : NaN;
  } catch {
    typed = NaN;
  }
  const split = gstOn && !Number.isNaN(typed) ? expenseGstSplit(enterAs === "total" ? { grossPaise: typed, rateBp, supplierStateCode: stateCode } : { taxablePaise: typed, rateBp, supplierStateCode: stateCode }) : null;
  const gross = split ? split.grossPaise : typed;
  const gst: ExpenseGst | null = split
    ? { supplier: { entityId: supplier?.id ?? null, name: supplier?.name ?? supName.trim(), gstin, stateCode }, billNo: billNo.trim(), billDate, rateBp, taxablePaise: split.taxablePaise, cgstPaise: split.cgstPaise, sgstPaise: split.sgstPaise, igstPaise: split.igstPaise }
    : null;

  const fromRef: MoneyAccountRef | null = register ? { kind: register.kind, registerId: register.id, name: register.name } : null;
  const toRef: MoneyAccountRef | null = category ? { kind: "EXPENSE", categoryId: category.id, name: category.name } : null;
  const problem = !toRef
    ? "Choose a category."
    : !fromRef
      ? "Choose where it was paid from."
      : gstOn && (!gst?.supplier.name || !gst.billNo)
        ? "Give the supplier and bill number."
        : (() => {
            const code = moneyEntryError({ from: fromRef, to: toRef, amountPaise: gross, businessDay: day, note: note || null, isCorrection: false, gst }, indiaDate());
            return code ? MONEY_ERROR_TEXT[code] : null;
          })();

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { categoryId: id } = await saveExpenseCategory({ name: newCategory.trim() });
      setCategoryId(id);
      setNewCategory("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (problem || !register || !category) return;
    setBusy(true);
    setError(null);
    try {
      await recordExpense({ categoryId: category.id, registerId: register.id, registerKind: register.kind, amountPaise: gross, businessDay: day, note: note.trim() || null, gst });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add expense" onClose={onClose} busy={busy} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="ex-cat">
          <div className="space-y-1.5">
            <Select id="ex-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose…</option>
              {categories
                .filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
            <div className="flex gap-1.5">
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Or add a category" className="flex-1" aria-label="New category" maxLength={60} />
              <Button size="sm" onClick={() => void addCategory()} disabled={!newCategory.trim() || busy}>
                Add
              </Button>
            </div>
          </div>
        </Field>
        <Field label="Paid from" htmlFor="ex-from">
          <Select id="ex-from" value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
            {registers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={gstOn ? (enterAs === "total" ? "Bill total (₹)" : "Taxable value (₹)") : "Amount (₹)"} htmlFor="ex-amount">
          <Input id="ex-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="num" autoFocus />
        </Field>
        <Field label="Day" htmlFor="ex-day">
          <Input id="ex-day" type="date" value={day} max={indiaDate()} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>
      <Field label="Note" htmlFor="ex-note">
        <Input id="ex-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={500} />
      </Field>

      <label className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <input type="checkbox" checked={gstOn} onChange={(e) => setGstOn(e.target.checked)} className="size-3.5 accent-brand-orange" />
        GST bill (claim the input credit)
      </label>
      {gstOn ? (
        <div className="space-y-3 rounded-lg bg-canvas px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier" htmlFor="ex-sup">
              <Select id="ex-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Type the supplier's details…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.gstin}
                  </option>
                ))}
              </Select>
            </Field>
            {!supplier ? (
              <Field label="Supplier name" htmlFor="ex-supname">
                <Input id="ex-supname" value={supName} onChange={(e) => setSupName(e.target.value)} />
              </Field>
            ) : (
              <div />
            )}
            {!supplier ? (
              <>
                <Field label="Supplier GSTIN" htmlFor="ex-supgst" error={gstinCheck && !gstinCheck.valid ? gstinCheck.reason : undefined}>
                  <Input id="ex-supgst" value={supGstin} onChange={(e) => setSupGstin(e.target.value.toUpperCase())} className="font-mono" maxLength={15} />
                </Field>
                <Field label="Supplier state" htmlFor="ex-supstate">
                  <Select id="ex-supstate" value={stateCode} onChange={(e) => setSupState(e.target.value)} disabled={Boolean(gstinCheck?.valid)}>
                    {STATES.map(([c, l]) => (
                      <option key={c} value={c}>
                        {l} ({c})
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : null}
            <Field label="Bill no." htmlFor="ex-bill">
              <Input id="ex-bill" value={billNo} onChange={(e) => setBillNo(e.target.value)} maxLength={40} />
            </Field>
            <Field label="Bill date" htmlFor="ex-billdate">
              <Input id="ex-billdate" type="date" value={billDate} max={indiaDate()} onChange={(e) => setBillDate(e.target.value)} />
            </Field>
            <Field label="GST rate" htmlFor="ex-rate">
              <Select id="ex-rate" value={String(rateBp)} onChange={(e) => setRateBp(Number(e.target.value))}>
                {RATES.map((r) => (
                  <option key={r} value={r}>
                    {r / 100}%
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="I'm entering" htmlFor="ex-enter">
              <div id="ex-enter">
                <Segmented
                  value={enterAs}
                  onChange={setEnterAs}
                  options={[
                    ["total", "The bill total"],
                    ["taxable", "The taxable value"],
                  ]}
                />
              </div>
            </Field>
          </div>
          {split ? (
            <p className="num text-[13px] text-ink">
              Taxable {formatINR(split.taxablePaise)}
              {split.cgstPaise ? ` + CGST ${formatINR(split.cgstPaise)} + SGST ${formatINR(split.sgstPaise)}` : ` + IGST ${formatINR(split.igstPaise)}`} = <b>{formatINR(split.grossPaise)}</b>
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        {problem ? <span className="mr-auto text-[12px] text-ink-muted">{problem}</span> : null}
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={busy} disabled={Boolean(problem)}>
          Save expense
        </Button>
      </div>
    </Modal>
  );
}
