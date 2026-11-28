import { Archive, ArchiveRestore, CalendarPlus, Lock, Pencil, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { companyPeriod, companyPeriodIn, indiaDate, nextYearDates, prettyDay } from "@technofluid/core";
import { Banner, Button, Detail, Details, Dialog, Field, FormError, IconButton, Input, Menu, SidePanel, Spinner, Textarea } from "@/components/ui";
import { closeCompanyYear, getCompanyInfo, setCompanyArchived, updateCompany, type CompanyDetails, type CompanyInfo, type CompanyRow } from "@/services/companyService";
import { CompanyKindBadge } from "./CompaniesScreen";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * One company, in full (Companies side panel): its details and period, entries in the books
 * (read from Humble Ledger when opened), Close year, New financial year from it, and the
 * owner-only actions (alter details, archive) — which the app's accountant login can only ask
 * for: Humble Ledger answers with a plain "ask the owner".
 */
export function CompanyPanel({ company: c, companies, onClose, onNewYear }: { company: CompanyRow; companies: CompanyRow[]; onClose: () => void; onNewYear: () => void }) {
  const [info, setInfo] = useState<CompanyInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = async () => {
    setLoadingInfo(true);
    try {
      setInfo(await getCompanyInfo(c.id));
      setInfoError(null);
    } catch (e) {
      setInfoError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingInfo(false);
    }
  };
  useEffect(() => {
    setInfo(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id]);

  const continuedBy = companies.filter((x) => x.line === c.line && x.id !== c.id && (x.lineFrom ?? "") > (c.lineFrom ?? ""));
  const d = c.details;
  const address = [d.address, d.state, d.pincode, d.country].filter(Boolean).join(", ");

  return (
    <SidePanel label="Company details" onClose={onClose}>
      <div className="flex shrink-0 items-start gap-2 px-6 pt-6 pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title font-semibold text-ink">{c.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-label text-ink-muted">
            <span>{companyPeriodIn(c, companies)}</span>
            <CompanyKindBadge company={c} />
          </div>
        </div>
        <Menu
          size="sm"
          items={[
            { label: "Edit details", icon: <Pencil />, onSelect: () => setEditing(true) },
            !c.isMain && { label: c.archived ? "Unarchive" : "Archive", icon: c.archived ? <ArchiveRestore /> : <Archive />, onSelect: () => setArchiving(true), danger: !c.archived },
          ]}
        />
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6">
        {c.accessLost ? (
          <Banner tone="danger" title="No access">
            The app's Humble Ledger login can no longer open this company. Ask the owner to give it access again.
          </Banner>
        ) : null}
        {c.archived ? <Banner tone="info">Archived: read-only. Reports still work; nothing new can be added.</Banner> : null}

        <Details columns={2}>
          <Detail label="Books begin">{c.booksBeginFrom ? prettyDay(c.booksBeginFrom) : "From the start"}</Detail>
          <Detail label="Financial year starts">{MONTHS[(c.fyStartMonth ?? 4) - 1]}</Detail>
          <Detail label="Closed up to">{c.lockedThrough ? prettyDay(c.lockedThrough) : "Not closed"}</Detail>
          <Detail label="What it keeps">{c.line === "main" ? "Sales, purchases, stock, money" : "Money only"}</Detail>
          {c.carriedFrom ? (
            <Detail label="Carried forward" className="col-span-2">
              From {c.carriedFrom.name} as of {prettyDay(c.carriedFrom.asOf)} — unpaid bills {c.carriedFrom.pendingBills === "ITEMIZED" ? "one by one" : "as one total per party"}
            </Detail>
          ) : c.copiedFrom ? (
            <Detail label="Copied from" className="col-span-2">{c.copiedFrom.name}</Detail>
          ) : null}
          {continuedBy.length ? (
            <Detail label="Continued by" className="col-span-2">
              {continuedBy.map((x) => `${x.name} (${companyPeriodIn(x, companies)})`).join(", ")}
            </Detail>
          ) : null}
          {d.mailingName ? <Detail label="Mailing name" className="col-span-2">{d.mailingName}</Detail> : null}
          {address ? <Detail label="Address" className="col-span-2">{address}</Detail> : null}
          {d.phone ? <Detail label="Phone">{d.phone}</Detail> : null}
          {d.email ? <Detail label="Email">{d.email}</Detail> : null}
          {c.createdBy ? <Detail label="Added by">{c.createdBy}</Detail> : c.madeInHl ? <Detail label="Added">In Humble Ledger</Detail> : null}
        </Details>

        <section className="border-t border-line-row pt-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1 text-body font-semibold text-ink">In the books</h3>
            <IconButton label="Refresh" size="sm" onClick={() => void load()} disabled={loadingInfo}>
              {loadingInfo ? <Spinner /> : <RefreshCw />}
            </IconButton>
          </div>
          {infoError ? (
            <p className="text-label text-danger">{infoError}</p>
          ) : !info ? (
            <p className="text-label text-ink-muted">Reading from Humble Ledger…</p>
          ) : (
            <Details columns={2}>
              <Detail label="Entries">{info.transactionCount.toLocaleString("en-IN")}</Detail>
              <Detail label="Last entry">{info.lastEntryDate ? prettyDay(info.lastEntryDate) : "None yet"}</Detail>
              <Detail label="First entry">{info.firstEntryDate ? prettyDay(info.firstEntryDate) : "None yet"}</Detail>
            </Details>
          )}
        </section>

        <section className="space-y-2 border-t border-line-row pt-4">
          <h3 className="text-body font-semibold text-ink">Year end</h3>
          <p className="text-label text-ink-muted">Close a year once it's done, then start the next one. Only the owner can reopen a closed year.</p>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Lock />} onClick={() => setClosing(true)} disabled={c.archived || c.accessLost}>
              Close year…
            </Button>
            <Button icon={<CalendarPlus />} onClick={onNewYear} disabled={c.accessLost}>
              New financial year
            </Button>
          </div>
        </section>
      </div>

      {closing ? <CloseYearDialog company={c} onClose={() => setClosing(false)} onDone={() => void load()} /> : null}
      {editing ? <EditCompanyDialog company={c} onClose={() => setEditing(false)} /> : null}
      {archiving ? <ArchiveDialog company={c} onClose={() => setArchiving(false)} /> : null}
    </SidePanel>
  );
}

/** Close year: locks the books through a date. Explains that it can't be undone from the app. */
export function CloseYearDialog({ company: c, defaultDate, onClose, onDone }: { company: CompanyRow; defaultDate?: string; onClose: () => void; onDone?: (lockedThrough: string) => void }) {
  const today = indiaDate();
  const suggested = defaultDate ?? nextYearDates(c, today).asOf;
  const [day, setDay] = useState(suggested <= today ? suggested : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!day) return setError("Pick the last day of the year to close.");
    setBusy(true);
    setError(null);
    try {
      const r = await closeCompanyYear(c.id, day);
      onDone?.(r.lockedThrough);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Close year — ${c.name}`}
      onClose={onClose}
      busy={busy}
      size="md"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Lock />} loading={busy} onClick={() => void submit()}>
            Close the year
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">Nothing dated on or before this day can be added, changed or reversed in {c.name} afterwards. Mistakes are then fixed with an entry after it.</p>
      <Field label="Close up to and including" htmlFor="close-day" help={c.lockedThrough ? `Closed up to ${prettyDay(c.lockedThrough)} now.` : "Usually the last day of the financial year (31 March)."}>
        <Input id="close-day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="w-44" />
      </Field>
      <Banner tone="warning">Only the owner can reopen a closed year, in Humble Ledger. If a year is reopened after its balances were carried forward, the new year's opening balances go out of date.</Banner>
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  );
}

function EditCompanyDialog({ company: c, onClose }: { company: CompanyRow; onClose: () => void }) {
  const [name, setName] = useState(c.name);
  const [details, setDetails] = useState<CompanyDetails>(c.details);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof CompanyDetails) => (e: { target: { value: string } }) => setDetails((d) => ({ ...d, [k]: e.target.value }));

  const submit = async () => {
    if (!name.trim()) return setError("Give the company a name.");
    setBusy(true);
    setError(null);
    try {
      await updateCompany(c.id, name, details);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Edit company details"
      subtitle="Needs the company's owner in Humble Ledger"
      onClose={onClose}
      busy={busy}
      size="md"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <CompanyDetailsFields name={name} onName={setName} details={details} set={set} />
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  );
}

/** Name + mailing details, shared by Add company and Edit details. */
export function CompanyDetailsFields({ name, onName, details: d, set, nameError }: { name: string; onName: (v: string) => void; details: CompanyDetails; set: (k: keyof CompanyDetails) => (e: { target: { value: string } }) => void; nameError?: string }) {
  return (
    <>
      <Field label="Company name" htmlFor="co-name" error={nameError} help="Two companies can share a name (for example one per financial year).">
        <Input id="co-name" value={name} onChange={(e) => onName(e.target.value)} maxLength={100} autoFocus invalid={Boolean(nameError)} />
      </Field>
      <Field label="Mailing name" htmlFor="co-mailing" optional>
        <Input id="co-mailing" value={d.mailingName ?? ""} onChange={set("mailingName")} maxLength={120} />
      </Field>
      <Field label="Address" htmlFor="co-address" optional>
        <Textarea id="co-address" rows={2} value={d.address ?? ""} onChange={set("address")} maxLength={300} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="State" htmlFor="co-state" optional>
          <Input id="co-state" value={d.state ?? ""} onChange={set("state")} maxLength={60} />
        </Field>
        <Field label="PIN code" htmlFor="co-pin" optional>
          <Input id="co-pin" value={d.pincode ?? ""} onChange={set("pincode")} maxLength={6} inputMode="numeric" />
        </Field>
        <Field label="Phone" htmlFor="co-phone" optional>
          <Input id="co-phone" value={d.phone ?? ""} onChange={set("phone")} maxLength={30} />
        </Field>
      </div>
      <Field label="Email" htmlFor="co-email" optional>
        <Input id="co-email" type="email" value={d.email ?? ""} onChange={set("email")} maxLength={120} />
      </Field>
    </>
  );
}

function ArchiveDialog({ company: c, onClose }: { company: CompanyRow; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archive = !c.archived;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await setCompanyArchived(c.id, archive);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={archive ? `Archive ${c.name}?` : `Unarchive ${c.name}?`}
      onClose={onClose}
      busy={busy}
      danger={archive}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={archive ? "danger" : "primary"} loading={busy} onClick={() => void submit()}>
            {archive ? "Archive" : "Unarchive"}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">
        {archive ? "The company becomes read-only: its reports still work, but nothing new can be added. It's hidden from the list unless you show archived companies." : "The company can be used again."}
      </p>
      <p className="text-label text-ink-muted">This needs the company's owner in Humble Ledger.</p>
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  );
}
