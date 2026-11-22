import { useState } from "react";
import { Banner, Button, Field, Input, Select } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { saveStockItem, type StockItem } from "@/services/stockService";

/**
 * Add or edit a raw material, consumable, premix or blend (a premix's/blend's recipe is
 * changed from its panel, with approval). (Product stock pools come from the
 * products, so they aren't edited here.) The server checks names/codes are unique and
 * that the unit doesn't change once the item has stock history.
 */
export function StockItemForm({
  item,
  onDone,
}: {
  item: StockItem | null;
  /** Called with the saved item's id, or null when cancelled. */
  onDone: (itemId: string | null) => void;
}) {
  const [kind, setKind] = useState<"raw_material" | "consumable" | "premix" | "blend">(
    item?.kind === "consumable" || item?.kind === "premix" || item?.kind === "blend" ? item.kind : "raw_material",
  );
  const coded = kind !== "consumable";
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const { role } = useStaff();
  // An item imported without a unit keeps none until an Admin sets it.
  const unitless = Boolean(item && !item.unitSet);
  const [baseUnit, setBaseUnit] = useState<"" | StockItem["baseUnit"]>(unitless ? "" : (item?.baseUnit ?? "L"));
  const [density, setDensity] = useState(item?.densityKgPerL != null ? String(item.densityKgPerL) : "");
  const [aliases, setAliases] = useState((item?.aliases ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasHistory = Boolean(item?.lastMovementAt) || (item?.onHandMilli ?? 0) !== 0;

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Enter a name.");
    const d = density.trim() ? Number(density) : null;
    if (d !== null && (!Number.isFinite(d) || d < 0.3 || d > 3)) return setError("Density is between 0.3 and 3 kg per litre.");
    setBusy(true);
    try {
      const { itemId } = await saveStockItem({
        ...(item ? { itemId: item.id } : { kind }),
        name: name.trim(),
        code: coded && code.trim() ? code.trim() : null,
        baseUnit: baseUnit || null,
        densityKgPerL: d,
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      });
      onDone(itemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone(null);
      }}
    >
      <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        {item ? null : (
          <Field label="Kind" htmlFor="si-kind">
            <Select id="si-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="raw_material">Raw material (base oil, additive…)</option>
              <option value="consumable">Consumable (can, cap, carton…)</option>
              <option value="premix">Premix (base oil + polymer, made here)</option>
              <option value="blend">Blend (house base oil, made here)</option>
            </Select>
          </Field>
        )}
        <Field label="Name" htmlFor="si-name">
          <Input id="si-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </Field>
        {coded ? (
          <Field label="Recipe code" htmlFor="si-code" help="The short name used in recipes, e.g. w150.">
            <Input id="si-code" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" maxLength={24} />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Counted in"
            htmlFor="si-unit"
            help={
              hasHistory
                ? "Fixed: it has stock history."
                : unitless && role !== "admin"
                  ? "Only an Admin can set the unit."
                  : unitless
                    ? "Not set yet. Choose it to start counting."
                    : undefined
            }
          >
            <Select
              id="si-unit"
              value={baseUnit}
              onChange={(e) => setBaseUnit(e.target.value as typeof baseUnit)}
              disabled={hasHistory || (unitless && role !== "admin")}
            >
              {unitless ? <option value="">Not set</option> : null}
              <option value="L">Litres</option>
              <option value="kg">Kilograms</option>
              <option value="piece">Pieces</option>
            </Select>
          </Field>
          <Field label="Density kg/L" htmlFor="si-density">
            <Input id="si-density" value={density} onChange={(e) => setDensity(e.target.value)} inputMode="decimal" placeholder="0.87" className="num" />
          </Field>
        </div>
        <Field label="Other names" htmlFor="si-aliases" help="Comma-separated, e.g. W 150, 150N.">
          <Input id="si-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>
        {error ? <Banner tone="danger">{error}</Banner> : null}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => onDone(null)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {busy ? "Saving…" : item ? "Save" : "Add item"}
        </Button>
      </div>
    </form>
  );
}
