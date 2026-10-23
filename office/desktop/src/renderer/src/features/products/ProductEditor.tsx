import { Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatINR, packPricePaise, piecesPerPackFromLabel, priceBasisFromLabel, toMilli } from "@technofluid/core";
import { Button, Field, Input, Select, Switch, modKey } from "@/components/ui";
import { addProduct, editProduct, GST_SLABS } from "@/services/productEditService";
import { PRICE_PER_OPTIONS } from "@/services/priceService";
import type { Product } from "@/services/productService";
import {
  EMPTY_FORM,
  formValuesFor,
  parsePrice,
  readEditForm,
  readNewForm,
  suggestSku,
  type ProductFormErrors,
  type ProductFormValues,
} from "./productFormValues";

/** Edit an existing product, or add one (from scratch, or as a copy of `from`). */
export type ProductEditorMode = { kind: "edit"; product: Product } | { kind: "new"; from?: Product };

export function ProductEditor({
  mode,
  onDone,
  onDirtyChange,
}: {
  mode: ProductEditorMode;
  /** Edit: number of fields saved (0 = cancelled). Add: the new SKU (null = cancelled). */
  onDone: (result: { saved: number; newSku?: string }) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const isNew = mode.kind === "new";
  const source = mode.kind === "edit" ? mode.product : mode.from;
  const initial = useMemo<ProductFormValues>(
    () => (source ? { ...formValuesFor(source), active: true } : EMPTY_FORM),
    [source],
  );
  const [values, setValues] = useState<ProductFormValues>(() =>
    mode.kind === "edit" ? formValuesFor(mode.product) : { ...initial, sku: "" },
  );
  const [skuTouched, setSkuTouched] = useState(false);
  const [switchOff, setSwitchOff] = useState(false);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Suggest a SKU from name, grade and pack until the person types their own.
  const sku = isNew && !skuTouched ? suggestSku(values, mode.from?.sku) : values.sku;

  const changeCount = useMemo(
    () => (mode.kind === "edit" ? Object.keys(readEditForm(values, mode.product).changes).length : 0),
    [values, mode],
  );
  const dirty = isNew ? JSON.stringify({ ...values, sku: "" }) !== JSON.stringify({ ...initial, sku: "" }) || skuTouched : changeCount > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setSaveError(null);
  };

  const cancel = () => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    onDone({ saved: 0 });
  };

  const save = async () => {
    setSaveError(null);
    if (mode.kind === "edit") {
      const { changes, errors: found } = readEditForm(values, mode.product);
      setErrors(found);
      if (Object.keys(found).length > 0 || Object.keys(changes).length === 0) return;
      setSaving(true);
      try {
        const saved = await editProduct(mode.product.sku, changes);
        onDone({ saved: saved.length });
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
        setSaving(false);
      }
      return;
    }

    const { product, errors: found } = readNewForm({ ...values, sku });
    setErrors(found);
    if (!product) return;
    setSaving(true);
    try {
      const newSku = await addProduct(product, mode.from ? { of: mode.from.sku, switchOffOriginal: switchOff } : undefined);
      onDone({ saved: 1, newSku });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  };

  // "1 pack = ₹…" so a per-litre / per-piece mix-up is obvious before saving.
  const packPreview = useMemo(() => {
    const dealer = parsePrice(values.dealerPrice);
    const distributor = parsePrice(values.distributorPrice);
    const qty = Number(values.packQty);
    if (!values.pricePer || "error" in dealer || "error" in distributor || !(qty > 0)) return null;
    if (dealer.paise === null && distributor.paise === null) return null;
    try {
      const basis = priceBasisFromLabel(values.pricePer);
      const piecesPerPack = piecesPerPackFromLabel(values.packLabel) ?? undefined;
      const one = (paise: number | null) =>
        paise === null
          ? "—"
          : formatINR(packPricePaise({ basis, pricePaise: paise, packQtyMilli: toMilli(qty), piecesPerPack }));
      return `1 pack: ${one(dealer.paise)} / ${one(distributor.paise)}`;
    } catch {
      return null;
    }
  }, [values.dealerPrice, values.distributorPrice, values.pricePer, values.packLabel, values.packQty]);

  const unitWord = values.pricePer.startsWith("per ") ? values.pricePer.slice(4) : "unit";
  const gstOptions = (GST_SLABS as readonly number[]).includes(Number(initial.gstPct))
    ? [...GST_SLABS]
    : [...GST_SLABS, Number(initial.gstPct)].sort((a, b) => a - b);

  const input = (key: keyof ProductFormValues, props: React.ComponentProps<typeof Input> = {}) => (
    <Input
      id={`pf-${key}`}
      value={String(values[key])}
      onChange={(e) => set(key, e.target.value as never)}
      invalid={Boolean(errors[key])}
      {...props}
    />
  );

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <Field label="Name" htmlFor="pf-name" error={errors.name}>
          {input("name", { autoFocus: true })}
        </Field>

        {isNew ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Grade" htmlFor="pf-grade" error={errors.grade}>
              {input("grade", { placeholder: "e.g. 68" })}
            </Field>
            <Field label="Category" htmlFor="pf-category" error={errors.category}>
              <Select id="pf-category" value={values.category} onChange={(e) => set("category", e.target.value)}>
                <option value="bulk_oil">Bulk oil</option>
                <option value="grease">Grease</option>
                <option value="retail">Retail pack</option>
              </Select>
            </Field>
          </div>
        ) : null}

        <Field label="Pack" htmlFor="pf-packLabel" error={errors.packLabel}>
          {input("packLabel", { placeholder: "e.g. 26 L can" })}
        </Field>

        {isNew ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Pack size" htmlFor="pf-packQty" error={errors.packQty}>
                {input("packQty", { inputMode: "decimal", placeholder: "26", className: "num" })}
              </Field>
              <Field label="Unit" htmlFor="pf-baseUnit" error={errors.baseUnit}>
                <Select id="pf-baseUnit" value={values.baseUnit} onChange={(e) => set("baseUnit", e.target.value)}>
                  <option value="L">Litre</option>
                  <option value="kg">Kg</option>
                  <option value="piece">Piece</option>
                </Select>
              </Field>
            </div>
            <Field label="SKU" htmlFor="pf-sku" error={errors.sku}>
              <Input
                id="pf-sku"
                value={sku}
                onChange={(e) => {
                  setSkuTouched(true);
                  set("sku", e.target.value.toUpperCase());
                }}
                invalid={Boolean(errors.sku)}
                className="font-mono"
              />
            </Field>
          </>
        ) : null}

        <div className="grid grid-cols-3 gap-2 pt-2">
          <Field label="Price" htmlFor="pf-pricePer" error={errors.pricePer}>
            <Select
              id="pf-pricePer"
              value={values.pricePer}
              onChange={(e) => set("pricePer", e.target.value)}
              invalid={Boolean(errors.pricePer)}
            >
              {values.pricePer ? null : <option value="">—</option>}
              {PRICE_PER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Dealer ₹/${unitWord}`} htmlFor="pf-dealerPrice" error={errors.dealerPrice}>
            {input("dealerPrice", { inputMode: "decimal", placeholder: "No price", className: "num" })}
          </Field>
          <Field label={`Distrib. ₹/${unitWord}`} htmlFor="pf-distributorPrice" error={errors.distributorPrice}>
            {input("distributorPrice", { inputMode: "decimal", placeholder: "No price", className: "num" })}
          </Field>
        </div>
        {packPreview ? <p className="num -mt-1 text-[12px] text-ink-muted">{packPreview}</p> : null}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Field label="GST" htmlFor="pf-gstPct" error={errors.gstPct}>
            <Select id="pf-gstPct" value={values.gstPct} onChange={(e) => set("gstPct", e.target.value)}>
              {gstOptions.map((rate) => (
                <option key={rate} value={String(rate)}>
                  {rate}%{(GST_SLABS as readonly number[]).includes(rate) ? "" : " (old)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="HSN" htmlFor="pf-hsnCode" error={errors.hsnCode}>
            <Input
              id="pf-hsnCode"
              inputMode="numeric"
              placeholder="27101980"
              value={values.hsnCode}
              onChange={(e) => set("hsnCode", e.target.value.replace(/\D/g, "").slice(0, 8))}
              invalid={Boolean(errors.hsnCode)}
              className="num"
            />
          </Field>
          <Field label="Sold to" htmlFor="pf-segment" error={errors.segment}>
            <Select id="pf-segment" value={values.segment} onChange={(e) => set("segment", e.target.value)}>
              {values.segment ? null : <option value="">—</option>}
              <option value="Both">All buyers</option>
              <option value="Automotive">Automotive</option>
              <option value="Industrial">Industrial</option>
            </Select>
          </Field>
          <Field label="Density kg/L" htmlFor="pf-density" error={errors.density}>
            {input("density", { inputMode: "decimal", placeholder: "0.88", className: "num" })}
          </Field>
        </div>

        {mode.kind === "edit" ? (
          <>
            <label htmlFor="pf-active" className="flex items-center justify-between pt-2 text-[13px] text-ink">
              Selling
              <Switch id="pf-active" checked={values.active} onChange={(on) => set("active", on)} label="Selling" />
            </label>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-faint">
              <Lock className="size-3" /> SKU, grade and pack size are fixed. Use Copy to change them.
            </p>
          </>
        ) : mode.from ? (
          <label className="flex items-center gap-2 pt-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={switchOff}
              onChange={(e) => setSwitchOff(e.target.checked)}
              className="size-3.5 accent-brand-orange"
            />
            Stop selling <span className="font-mono text-[12px]">{mode.from.sku}</span>
          </label>
        ) : null}

        {saveError ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
            {saveError}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!isNew && !dirty}
          title={`${modKey()} Enter`}
        >
          {isNew ? "Add product" : changeCount > 1 ? `Save ${changeCount} changes` : "Save"}
        </Button>
      </div>
    </form>
  );
}
