import { Building2, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { checkGstin, COMPANY_ERROR_TEXT, companyError, DEFAULT_INVOICE_PREFIX, financialYear, GST_STATES, indiaDate, invoiceNumber, type CompanyBank, type CompanyProfile } from "@technofluid/core";
import { Button, Card, Field, Input, Spinner } from "@/components/ui";
import { useCompany } from "@/hooks/useSales";
import { saveCompanyProfile } from "@/services/saleService";

type Form = Omit<CompanyProfile, "stateCode" | "tradeName" | "phone" | "email" | "bank" | "invoiceTerms"> & { tradeName: string; phone: string; email: string; bank: CompanyBank; terms: string };

const NO_BANK: CompanyBank = { name: "", branch: "", accountType: "", accountNo: "", ifsc: "" };

const EMPTY: Form = {
  legalName: "",
  tradeName: "",
  gstin: "",
  address: { line1: "", line2: "", city: "", pincode: "" },
  phone: "",
  email: "",
  invoicePrefix: DEFAULT_INVOICE_PREFIX,
  bank: NO_BANK,
  terms: "",
};

/**
 * Settings (Admin). For now: who the seller is — printed on every invoice — the
 * invoice-number prefix, and the bank details and terms printed on the invoice. Sales are refused until this is complete. Staff logins and roles
 * come next.
 */
export function SettingsScreen() {
  const company = useCompany();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (company.status !== "ready" || loaded) return;
    const c = company.data;
    if (c) setForm({ ...c, tradeName: c.tradeName ?? "", phone: c.phone ?? "", email: c.email ?? "", address: { ...EMPTY.address, ...c.address }, bank: { ...NO_BANK, ...c.bank }, terms: (c.invoiceTerms ?? []).join("\n") });
    setLoaded(true);
  }, [company, loaded]);

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };
  const setAddress = (patch: Partial<Form["address"]>) => set({ address: { ...form.address, ...patch } });
  const setBank = (patch: Partial<CompanyBank>) => set({ bank: { ...form.bank, ...patch } });

  const gstin = form.gstin.replace(/\s+/g, "").toUpperCase();
  const check = gstin ? checkGstin(gstin) : null;
  const code = companyError({ ...form, gstin, tradeName: form.tradeName || null, phone: form.phone || null, email: form.email || null, invoicePrefix: form.invoicePrefix.toUpperCase() });
  let example = "";
  try {
    example = invoiceNumber(form.invoicePrefix.toUpperCase(), financialYear(indiaDate()), 1);
  } catch {
    example = "";
  }

  if (company.status === "loading") return <Spinner className="m-6" />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-4">
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-brand-orange" />
            <h2 className="text-[15px] font-semibold text-ink">Company details on invoices</h2>
          </div>
          <p className="text-[12px] text-ink-muted">Printed at the top of every tax invoice. Billing is blocked until the legal name, GSTIN and address are filled in.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Legal name" htmlFor="co-legal">
              <Input id="co-legal" value={form.legalName} onChange={(e) => set({ legalName: e.target.value })} placeholder="Lube Chem Industries" maxLength={120} />
            </Field>
            <Field label="Trade name (optional)" htmlFor="co-trade">
              <Input id="co-trade" value={form.tradeName} onChange={(e) => set({ tradeName: e.target.value })} placeholder="Technofluid Lubricants" maxLength={120} />
            </Field>
            <Field
              label="GSTIN"
              htmlFor="co-gstin"
              error={check && !check.valid ? check.reason : undefined}
              help={check?.valid ? `${GST_STATES[check.stateCode]} (${check.stateCode}) — sales to this state are CGST + SGST` : undefined}
            >
              <Input id="co-gstin" value={form.gstin} onChange={(e) => set({ gstin: e.target.value })} invalid={Boolean(check && !check.valid)} className="font-mono uppercase" maxLength={20} />
            </Field>
            <Field label="Invoice number prefix" htmlFor="co-prefix" help={example ? `Numbers look like ${example}` : "1–3 capital letters or digits"}>
              <Input id="co-prefix" value={form.invoicePrefix} onChange={(e) => set({ invoicePrefix: e.target.value.toUpperCase() })} maxLength={3} className="font-mono uppercase" />
            </Field>
            <Field label="Address line 1" htmlFor="co-line1">
              <Input id="co-line1" value={form.address.line1} onChange={(e) => setAddress({ line1: e.target.value })} maxLength={160} />
            </Field>
            <Field label="Address line 2" htmlFor="co-line2">
              <Input id="co-line2" value={form.address.line2} onChange={(e) => setAddress({ line2: e.target.value })} maxLength={160} />
            </Field>
            <Field label="City" htmlFor="co-city">
              <Input id="co-city" value={form.address.city} onChange={(e) => setAddress({ city: e.target.value })} maxLength={60} />
            </Field>
            <Field label="PIN code" htmlFor="co-pin">
              <Input id="co-pin" value={form.address.pincode} onChange={(e) => setAddress({ pincode: e.target.value })} inputMode="numeric" maxLength={6} />
            </Field>
            <Field label="Phone (optional)" htmlFor="co-phone">
              <Input id="co-phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={30} />
            </Field>
            <Field label="Email (optional)" htmlFor="co-email">
              <Input id="co-email" value={form.email} onChange={(e) => set({ email: e.target.value })} maxLength={120} />
            </Field>
          </div>
          <div className="space-y-3 border-t border-line pt-4">
            <p className="text-[13px] font-medium text-ink">
              Bank details <span className="font-normal text-ink-muted">— printed under "Bank Details" on the invoice; leave empty to leave it off</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank name" htmlFor="co-bank">
                <Input id="co-bank" value={form.bank.name} onChange={(e) => setBank({ name: e.target.value })} placeholder="HDFC BANK" maxLength={60} />
              </Field>
              <Field label="Branch" htmlFor="co-branch">
                <Input id="co-branch" value={form.bank.branch} onChange={(e) => setBank({ branch: e.target.value })} placeholder="INDRI" maxLength={60} />
              </Field>
              <Field label="Account number" htmlFor="co-acno">
                <Input id="co-acno" value={form.bank.accountNo} onChange={(e) => setBank({ accountNo: e.target.value })} inputMode="numeric" className="font-mono" maxLength={30} />
              </Field>
              <Field label="Account type" htmlFor="co-actype">
                <Input id="co-actype" value={form.bank.accountType} onChange={(e) => setBank({ accountType: e.target.value })} placeholder="CA" maxLength={20} />
              </Field>
              <Field label="IFSC code" htmlFor="co-ifsc">
                <Input id="co-ifsc" value={form.bank.ifsc} onChange={(e) => setBank({ ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0002185" className="font-mono uppercase" maxLength={11} />
              </Field>
            </div>
            <Field label="Terms & conditions on the invoice" htmlFor="co-terms" help="One per line, up to 8 lines — e.g. E.& O.E. / 1. Goods once sold will not be taken back.">
              <textarea
                id="co-terms"
                value={form.terms}
                onChange={(e) => set({ terms: e.target.value })}
                rows={5}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink focus:border-brand-orange focus:outline-none"
              />
            </Field>
          </div>
          <p className="text-2xs text-ink-faint">A new prefix starts with the next financial year once this year already has invoices — numbers in one year never change their prefix.</p>
          {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            {code ? <span className="mr-auto text-[12px] text-ink-muted">{COMPANY_ERROR_TEXT[code]}</span> : null}
            {saved ? (
              <span className="mr-auto inline-flex items-center gap-1 text-[12px] text-success">
                <Check className="size-3.5" /> Saved
              </span>
            ) : null}
            <Button
              variant="primary"
              loading={busy}
              disabled={Boolean(code)}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const { terms, ...rest } = form;
                  await saveCompanyProfile({
                    ...rest,
                    gstin,
                    tradeName: form.tradeName.trim() || null,
                    phone: form.phone.trim() || null,
                    email: form.email.trim() || null,
                    bank: Object.values(form.bank).some((v) => v.trim()) ? form.bank : null,
                    invoiceTerms: terms.split("\n").map((l) => l.trim()).filter(Boolean),
                  });
                  setSaved(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </Card>
        <p className="text-[12px] text-ink-muted">Staff logins and roles come next.</p>
      </div>
    </div>
  );
}
