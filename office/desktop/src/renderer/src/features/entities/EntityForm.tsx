import { Plus, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  checkEntityInput,
  checkGstin,
  GST_STATES,
  indiaDate,
  normalizePhone,
  similarNames,
  rupeesToPaise,
  type EntityError,
  type EntityInput,
  type EntityKind,
} from "@technofluid/core";
import { Banner, Button, Checkbox, Dialog, Field, IconButton, Input, MoneyInput, Segmented, Select } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { lookUpGstin, saveEntity, type EntityRow } from "@/services/entityService";

const STATES = Object.entries(GST_STATES).sort((a, b) => a[1].localeCompare(b[1]));
const paiseText = (p: number | null | undefined) => (p == null ? "" : String(p / 100));

/**
 * Add or edit a customer / supplier (Admin, Accounts). Checked with the same rules the
 * server uses (@technofluid/core checkEntityInput); the server checks again. The opening
 * balance is asked for only when adding — it can't be changed later.
 */
export function EntityForm({
  entity,
  all,
  onClose,
}: {
  entity: EntityRow | null;
  /** Everyone else — for the "same phone" warning. */
  all: EntityRow[];
  onClose: (savedId: string | null) => void;
}) {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const walkIn = entity?.isWalkIn === true;
  const [name, setName] = useState(entity?.name ?? "");
  const [kinds, setKinds] = useState<EntityKind[]>(entity?.kinds ?? ["customer"]);
  const [phones, setPhones] = useState<string[]>(entity?.phones.length ? [...entity.phones] : [""]);
  const [email, setEmail] = useState(entity?.email ?? "");
  const [gstin, setGstin] = useState(entity?.gstin ?? "");
  const [gstVerified, setGstVerified] = useState<EntityRow["gstVerified"] | undefined>(undefined);
  const [line1, setLine1] = useState(entity?.address.line1 ?? "");
  const [line2, setLine2] = useState(entity?.address.line2 ?? "");
  const [city, setCity] = useState(entity?.address.city ?? "");
  const [district, setDistrict] = useState(entity?.address.district ?? "");
  const [pincode, setPincode] = useState(entity?.address.pincode ?? "");
  const [stateCode, setStateCode] = useState(entity?.address.stateCode ?? "06");
  // New customers default to the Dealer price list (decision #15); imports start empty.
  const [priceTier, setPriceTier] = useState<"" | "Dealer" | "Distributor">(entity ? (entity.priceTier ?? "") : "Dealer");
  const [credit, setCredit] = useState(paiseText(entity?.creditLimitPaise));
  const [notes, setNotes] = useState(entity?.notes ?? "");
  const [hasOpening, setHasOpening] = useState(false);
  const [openDir, setOpenDir] = useState<"receivable" | "payable">("receivable");
  const [openAmount, setOpenAmount] = useState("");
  const [openAsOf, setOpenAsOf] = useState(indiaDate());
  const [errors, setErrors] = useState<EntityError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [sameGstin, setSameGstin] = useState<string | null>(null);
  const [allowSameGstin, setAllowSameGstin] = useState(false);
  const [gstBusy, setGstBusy] = useState(false);
  const [gstNote, setGstNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  // A valid GSTIN decides the state (GST place of supply).
  const gstCheck = gstin.trim() ? checkGstin(gstin) : null;
  useEffect(() => {
    if (gstCheck?.valid) setStateCode(gstCheck.stateCode);
  }, [gstCheck?.valid, gstCheck?.valid ? gstCheck.stateCode : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const samePhone = useMemo(() => {
    const mine = phones.map((p) => normalizePhone(p)).filter(Boolean) as string[];
    return all.filter((e) => e.id !== entity?.id && e.phones.some((p) => mine.includes(p))).map((e) => e.name);
  }, [phones, all, entity?.id]);

  const sameName = useMemo(
    () => (walkIn ? [] : similarNames(name, all.filter((e) => e.id !== entity?.id).map((e) => e.name))),
    [name, all, entity?.id, walkIn],
  );

  const errorFor = (field: string) => errors.find((e) => e.field === field || e.field.startsWith(`${field}.`))?.message;

  const fillFromGst = async () => {
    setGstNote(null);
    if (!gstCheck?.valid) return setGstNote(gstCheck ? `GSTIN: ${gstCheck.reason}.` : "Type the GSTIN first.");
    setGstBusy(true);
    try {
      const g = await lookUpGstin(gstCheck.gstin);
      if (g.legalName && !name.trim()) setName(g.tradeName || g.legalName);
      if (g.address && !line1.trim()) setLine1(g.address.slice(0, 200));
      if (g.pincode && !pincode.trim()) setPincode(g.pincode);
      setGstVerified({ legalName: g.legalName, tradeName: g.tradeName, status: g.status, verifiedAt: new Date().toISOString() });
      setGstNote(`Found: ${g.legalName || g.tradeName}${g.status ? ` (${g.status})` : ""}.`);
    } catch (e) {
      setGstNote(`${e instanceof Error ? e.message : String(e)} You can type the details yourself.`);
    } finally {
      setGstBusy(false);
    }
  };

  const save = async () => {
    setMessage(null);
    setErrors([]);
    let creditLimitPaise: number | null = null;
    let openingPaise = 0;
    try {
      creditLimitPaise = credit.trim() ? rupeesToPaise(credit) : null;
    } catch {
      return setErrors([{ field: "creditLimitPaise", code: "credit_limit_invalid", message: "Enter the credit limit in ₹, like 50000." }]);
    }
    if (!entity && hasOpening) {
      try {
        openingPaise = rupeesToPaise(openAmount);
      } catch {
        return setErrors([{ field: "opening.amountPaise", code: "opening_amount_invalid", message: "Enter the amount in ₹, like 12500.50." }]);
      }
    }
    const raw: EntityInput = {
      name,
      kinds,
      phones: phones.filter((p) => p.trim()),
      email: email.trim() || null,
      gstin: gstin.trim() || null,
      address: { line1, line2, city, district, pincode, stateCode: stateCode || null },
      priceTier: kinds.includes("customer") ? priceTier || null : null,
      creditLimitPaise,
      notes: notes.trim() || null,
      ...(!entity && hasOpening ? { opening: { amountPaise: openingPaise, direction: openDir, asOf: openAsOf } } : {}),
    };
    const check = checkEntityInput(raw);
    if (!check.ok) return setErrors(check.errors);
    setBusy(true);
    try {
      const r = await saveEntity(check.value, {
        ...(entity ? { entityId: entity.id } : {}),
        ...(allowSameGstin ? { allowSameGstin: true } : {}),
        ...(gstVerified !== undefined ? { gstVerified } : {}),
      });
      onClose(r.entityId);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (/already used by/i.test(text)) setSameGstin(text);
      setMessage(text);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={entity ? `Edit ${entity.name}` : "Add customer or supplier"}
      subtitle={walkIn ? "The walk-in customer — only its notes can change." : "Saved here and in the books (Humble Ledger)."}
      size="lg"
      onClose={() => onClose(null)}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={() => onClose(null)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            {busy ? "Saving…" : entity ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <fieldset disabled={walkIn} className="min-w-0 space-y-4">
            <div className="grid grid-cols-[1fr_auto] items-end gap-4">
              <Field label="Name" htmlFor="en-name" error={errorFor("name")}>
                <Input id="en-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus={!walkIn} invalid={Boolean(errorFor("name"))} />
              </Field>
              <div className="flex h-8 items-center gap-4">
                {(["customer", "supplier"] as const).map((k) => (
                  <Checkbox
                    key={k}
                    checked={kinds.includes(k)}
                    onChange={(e) => setKinds((ks) => (e.target.checked ? [...ks, k] : ks.filter((x) => x !== k)))}
                    label={k === "customer" ? "Customer" : "Supplier"}
                  />
                ))}
              </div>
            </div>
            {errorFor("kinds") ? (
              <p role="alert" className="-mt-2 text-caption text-danger">
                {errorFor("kinds")}
              </p>
            ) : null}
            {sameName.length > 0 ? (
              <Banner tone="warning">
                Looks like {sameName.slice(0, 3).join(", ")}
                {sameName.length > 3 ? ` and ${sameName.length - 3} more` : ""} — check it isn't already here.
              </Banner>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone" htmlFor="en-phone-0" error={errorFor("phones")}>
                <div className="space-y-2">
                  {phones.map((p, i) => (
                    <div key={i} className="flex gap-1">
                      <Input
                        id={`en-phone-${i}`}
                        value={p}
                        onChange={(e) => setPhones((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))}
                        placeholder="98765 43210"
                        inputMode="tel"
                        className="flex-1"
                      />
                      {phones.length > 1 ? (
                        <IconButton label="Remove phone" onClick={() => setPhones((ps) => ps.filter((_, j) => j !== i))}>
                          <X />
                        </IconButton>
                      ) : null}
                    </div>
                  ))}
                  {phones.length < 3 ? (
                    <Button variant="ghost" size="sm" icon={<Plus />} className="-ml-2.5" onClick={() => setPhones((ps) => [...ps, ""])}>
                      Another phone
                    </Button>
                  ) : null}
                </div>
              </Field>
              <Field label="Email" htmlFor="en-email" error={errorFor("email")} optional>
                <Input id="en-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(errorFor("email"))} />
              </Field>
            </div>
            {samePhone.length > 0 ? <Banner tone="warning">Same phone as {samePhone.join(", ")} — fine if it's right.</Banner> : null}

            <Field label="GSTIN" htmlFor="en-gstin" error={errorFor("gstin")} help={gstNote ?? "A valid GSTIN sets the state."} optional>
              <div className="flex gap-2">
                <Input
                  id="en-gstin"
                  value={gstin}
                  onChange={(e) => {
                    setGstin(e.target.value.toUpperCase());
                    setGstVerified(gstin.trim() ? null : undefined);
                    setSameGstin(null);
                  }}
                  placeholder="06AABCT1234F1ZU"
                  className="flex-1 font-mono"
                  maxLength={15}
                  invalid={Boolean(errorFor("gstin"))}
                />
                <Button onClick={() => void fillFromGst()} loading={gstBusy} icon={<Search />}>
                  Fill from GST
                </Button>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Address" htmlFor="en-line1">
                <Input id="en-line1" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Shop / street" />
              </Field>
              <Field label="Area" htmlFor="en-line2" optional>
                <Input id="en-line2" value={line2} onChange={(e) => setLine2(e.target.value)} />
              </Field>
              <Field label="City" htmlFor="en-city">
                <Input id="en-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="District" htmlFor="en-district">
                <Input id="en-district" value={district} onChange={(e) => setDistrict(e.target.value)} />
              </Field>
              <Field label="PIN code" htmlFor="en-pin" error={errorFor("address.pincode")}>
                <Input id="en-pin" value={pincode} onChange={(e) => setPincode(e.target.value)} inputMode="numeric" maxLength={6} invalid={Boolean(errorFor("address.pincode"))} />
              </Field>
              <Field label="State (GST place of supply)" htmlFor="en-state" error={errorFor("address.stateCode")} help={gstCheck?.valid ? "Set by the GSTIN." : undefined}>
                <Select id="en-state" value={stateCode ?? ""} onChange={(e) => setStateCode(e.target.value)} disabled={Boolean(gstCheck?.valid)} invalid={Boolean(errorFor("address.stateCode"))}>
                  <option value="">Choose a state…</option>
                  {STATES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label} ({code})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {kinds.includes("customer") ? (
                <Field label="Price list" htmlFor="en-tier" error={errorFor("priceTier")} help={!priceTier ? "Sales can't bill this customer until it's chosen." : undefined}>
                  <div id="en-tier">
                    <Segmented
                      value={priceTier || "none"}
                      onChange={(v) => setPriceTier(v === "none" ? "" : v)}
                      options={[
                        ["Dealer", "Dealer"],
                        ["Distributor", "Distributor"],
                        ["none", "Not chosen"],
                      ]}
                    />
                  </div>
                </Field>
              ) : (
                <div />
              )}
              <Field label="Credit limit" htmlFor="en-credit" error={errorFor("creditLimitPaise")} help="A warning only — never blocks a sale.">
                <MoneyInput id="en-credit" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="No limit" invalid={Boolean(errorFor("creditLimitPaise"))} />
              </Field>
            </div>
          </fieldset>

          <Field label="Notes" htmlFor="en-notes" error={errorFor("notes")} optional>
            <Input id="en-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} invalid={Boolean(errorFor("notes"))} />
          </Field>

          {!entity ? (
            <div className="space-y-4 border-t border-line-row pt-4">
              <Checkbox
                checked={hasOpening}
                onChange={(e) => setHasOpening(e.target.checked)}
                label={
                  <>
                    <span className="font-medium">Opening balance</span>
                    <span className="text-ink-muted">— can't be changed later</span>
                  </>
                }
              />
              {hasOpening ? (
                <div className="grid grid-cols-[auto_1fr_auto] items-start gap-4">
                  <Field label="Who owes" htmlFor="en-open-dir">
                    <div id="en-open-dir">
                      <Segmented
                        value={openDir}
                        onChange={setOpenDir}
                        options={[
                          ["receivable", "They owe us"],
                          ["payable", "We owe them"],
                        ]}
                      />
                    </div>
                  </Field>
                  <Field label="Amount" htmlFor="en-open-amt" error={errorFor("opening.amountPaise")}>
                    <MoneyInput id="en-open-amt" value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="12500.50" invalid={Boolean(errorFor("opening.amountPaise"))} />
                  </Field>
                  <Field label="As of" htmlFor="en-open-date" error={errorFor("opening.asOf")}>
                    <Input id="en-open-date" type="date" value={openAsOf} onChange={(e) => setOpenAsOf(e.target.value)} invalid={Boolean(errorFor("opening.asOf"))} />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : entity.opening ? (
            <p className="text-label text-ink-muted">The opening balance can't be changed after it's added.</p>
          ) : null}

          {sameGstin && isAdmin ? (
            <Banner tone="warning">
              <Checkbox checked={allowSameGstin} onChange={(e) => setAllowSameGstin(e.target.checked)} label="It's a branch of the same firm — allow the same GSTIN (Admin)" />
            </Banner>
          ) : null}
          {message ? <Banner tone="danger">{message}</Banner> : null}
        </fieldset>
      </form>
    </Dialog>
  );
}
