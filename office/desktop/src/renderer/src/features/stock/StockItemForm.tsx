import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { saveStockItem, type StockItem } from "@/services/stockService";

/**
 * Add or edit a raw material or consumable. (Product stock pools come from the
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
  const [kind, setKind] = useState<"raw_material" | "consumable">(
    item?.kind === "consumable" ? "consumable" : "raw_material",
  );
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [baseUnit, setBaseUnit] = useState(item?.baseUnit ?? "L");
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
        code: kind === "raw_material" && code.trim() ? code.trim() : null,
        baseUnit,
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
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {item ? null : (
          <Field label="Kind" htmlFor="si-kind">
            <Select id="si-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="raw_material">Raw material (base oil, additive…)</option>
              <option value="consumable">Consumable (can, cap, carton…)</option>
            </Select>
          </Field>
        )}
        <Field label="Name" htmlFor="si-name">
          <Input id="si-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </Field>
        {kind === "raw_material" ? (
          <Field label="Recipe code" htmlFor="si-code" help="The short name used in recipes, e.g. w150.">
            <Input id="si-code" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" maxLength={24} />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Counted in" htmlFor="si-unit" help={hasHistory ? "Fixed — it has stock history." : undefined}>
            <Select
              id="si-unit"
              value={baseUnit}
              onChange={(e) => setBaseUnit(e.target.value as typeof baseUnit)}
              disabled={hasHistory}
            >
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
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={() => onDone(null)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          {item ? "Save" : "Add item"}
        </Button>
      </div>
    </form>
  );
}
