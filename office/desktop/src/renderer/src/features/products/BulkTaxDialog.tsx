import { useMemo, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/features/entities/EntityDetail";
import type { Product } from "@/services/productService";
import { GST_SLABS, setProductsTax } from "@/services/productEditService";

const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;

/**
 * Admin: set the GST % and/or HSN code on every product shown on the Products screen at
 * once (filter first — e.g. one category — then open this). A preview says how many
 * products actually change; the setProductsTax Cloud Function checks and logs each one.
 */
export function BulkTaxDialog({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const [gst, setGst] = useState<"keep" | `${number}`>("keep");
  const [hsnMode, setHsnMode] = useState<"keep" | "set" | "clear">("keep");
  const [hsn, setHsn] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const gstPct = gst === "keep" ? undefined : Number(gst);
  const hsnValue = hsnMode === "keep" ? undefined : hsnMode === "clear" ? null : hsn.trim();
  const hsnBad = hsnMode === "set" && !HSN_RE.test(hsn.trim());

  const preview = useMemo(() => {
    const gstChanges = gstPct === undefined ? 0 : products.filter((p) => p.gstPct !== gstPct).length;
    const hsnChanges = hsnValue === undefined || hsnBad ? 0 : products.filter((p) => (p.hsnCode ?? null) !== hsnValue).length;
    const any = products.filter((p) => (gstPct !== undefined && p.gstPct !== gstPct) || (hsnValue !== undefined && !hsnBad && (p.hsnCode ?? null) !== hsnValue)).length;
    const rates = new Map<number, number>();
    for (const p of products) rates.set(p.gstPct, (rates.get(p.gstPct) ?? 0) + 1);
    return { gstChanges, hsnChanges, any, rates: [...rates.entries()].sort((a, b) => b[1] - a[1]) };
  }, [products, gstPct, hsnValue, hsnBad]);

  const problem =
    gstPct === undefined && hsnValue === undefined
      ? "Choose a new GST %, an HSN code, or both."
      : hsnBad
        ? "HSN code must be 4, 6 or 8 digits."
        : preview.any === 0
          ? "Nothing would change — every product shown already has these values."
          : null;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const change: { gstPct?: number; hsnCode?: string | null } = {};
      if (gstPct !== undefined) change.gstPct = gstPct;
      if (hsnValue !== undefined) change.hsnCode = hsnValue;
      const r = await setProductsTax(
        products.map((p) => p.sku),
        change,
        reason.trim() || undefined,
      );
      setDone(`${r.changed.toLocaleString("en-IN")} product${r.changed === 1 ? "" : "s"} changed${r.unchanged ? `, ${r.unchanged} already right` : ""}${r.missing.length ? `, ${r.missing.length} no longer exist` : ""}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="GST / HSN changed" onClose={onClose} busy={false}>
        <p className="text-[13px] text-ink">{done}</p>
        <p className="text-[12px] text-ink-muted">New sales use the new values. Invoices already made keep the GST and HSN they were billed with.</p>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Change GST / HSN for ${products.length.toLocaleString("en-IN")} product${products.length === 1 ? "" : "s"}`} onClose={onClose} busy={busy}>
      <p className="text-[12px] text-ink-muted">
        This changes every product shown on the screen now
        {preview.rates.length ? ` (now: ${preview.rates.map(([r, n]) => `${n} at ${r}%`).join(", ")})` : ""}. Filter the list first — for example one category — to change only those. HSN codes usually differ by product type, so set them one group at a time.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="GST %" htmlFor="bt-gst">
          <Select id="bt-gst" value={gst} onChange={(e) => setGst(e.target.value as typeof gst)}>
            <option value="keep">Keep as it is</option>
            {GST_SLABS.map((r) => (
              <option key={r} value={String(r)}>
                {r}%
              </option>
            ))}
          </Select>
        </Field>
        <Field label="HSN code" htmlFor="bt-hsn-mode">
          <Select id="bt-hsn-mode" value={hsnMode} onChange={(e) => setHsnMode(e.target.value as typeof hsnMode)}>
            <option value="keep">Keep as it is</option>
            <option value="set">Set to…</option>
            <option value="clear">Remove it</option>
          </Select>
        </Field>
        {hsnMode === "set" ? (
          <Field label="New HSN code" htmlFor="bt-hsn" error={hsn.trim() && hsnBad ? "4, 6 or 8 digits" : undefined}>
            <Input id="bt-hsn" value={hsn} onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} className="num" placeholder="e.g. 27101980" />
          </Field>
        ) : null}
        <Field label="Reason" htmlFor="bt-reason">
          <Input id="bt-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Optional — e.g. rates from the CA" />
        </Field>
      </div>
      {!problem ? (
        <p className="rounded-md bg-canvas px-3 py-2 text-[13px] text-ink">
          {preview.any.toLocaleString("en-IN")} product{preview.any === 1 ? "" : "s"} will change
          {gstPct !== undefined ? ` · GST to ${gstPct}% on ${preview.gstChanges.toLocaleString("en-IN")}` : ""}
          {hsnValue !== undefined ? ` · HSN ${hsnValue === null ? "removed" : `set to ${hsnValue}`} on ${preview.hsnChanges.toLocaleString("en-IN")}` : ""}. Invoices already made don't change.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {problem ? <span className="mr-auto text-[12px] text-ink-muted">{problem}</span> : null}
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={busy} disabled={Boolean(problem)}>
          Change {preview.any.toLocaleString("en-IN")} product{preview.any === 1 ? "" : "s"}
        </Button>
      </div>
    </Modal>
  );
}
