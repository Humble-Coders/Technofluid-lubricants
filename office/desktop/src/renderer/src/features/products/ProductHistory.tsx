import { formatINR } from "@technofluid/core";
import { Spinner } from "@/components/ui";
import { useProductChanges } from "@/hooks/useProductChanges";
import type { ProductChange } from "@/services/productEditService";

const FIELD_LABEL: Record<string, string> = {
  product: "Name",
  orderableUnit: "Pack label",
  pricePer: "Price is",
  dealerPrice: "Dealer price",
  distributorPrice: "Distributor price",
  gstPct: "GST",
  hsnCode: "HSN code",
  segment: "Sold to",
  densityKgPerL: "Density",
  active: "Selling",
  deleted: "Deleted",
  recipe: "Recipe",
  recipeAlternates: "Alternates",
};

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return field === "dealerPrice" || field === "distributorPrice" ? "No price" : "—";
  }
  if (field === "recipeAlternates" && Array.isArray(value)) {
    // ["w150>w150n/46"] → "w150n 46% for w150"
    if (value.length === 0) return "None";
    return value
      .map((x) => {
        const [main, rest] = String(x).split(">");
        const [code, pct] = String(rest ?? "").split("/");
        return `${code?.trim()} ${pct?.trim() ? `${pct.trim()}%` : "(no %)"} for ${main?.trim()}`;
      })
      .join(", ");
  }
  if (field === "recipe" && Array.isArray(value)) {
    // ["n4/90", "w70/"] → "n4 90%, w70 (no %)"
    return value
      .map((x) => {
        const [code, pct] = String(x).split("/");
        return `${code?.trim()} ${pct?.trim() ? `${pct.trim()}%` : "(no %)"}`;
      })
      .join(", ");
  }
  switch (field) {
    case "dealerPrice":
    case "distributorPrice":
      return typeof value === "number" ? formatINR(value) : String(value);
    case "gstPct":
      return `${String(value)}%`;
    case "densityKgPerL":
      return `${String(value)} kg/L`;
    case "active":
      return value === true ? "On" : "Off";
    case "segment":
      return value === "Both" ? "All buyers" : String(value);
    default:
      return String(value);
  }
}

const when = (date: Date | null) =>
  date
    ? date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "Just now";

/** Who changed what on this product, newest first (Admin only). */
export function ProductHistory({ sku }: { sku: string }) {
  const state = useProductChanges(sku);

  return (
    <section>
      <h3 className="mb-2 text-label font-semibold text-ink">Change history</h3>
      {state.status === "loading" ? (
        <Spinner />
      ) : state.status === "error" ? (
        <p className="text-label text-danger">Couldn't load the history: {state.message}</p>
      ) : state.data.length === 0 ? (
        <p className="text-label text-ink-muted">Not changed in Technofluid Office yet.</p>
      ) : (
        <ol className="border-t border-line-row">
          {state.data.map((change) => (
            <ChangeRow key={change.id} change={change} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ChangeRow({ change }: { change: ProductChange }) {
  // Whole-product events read better as a sentence than as old → new.
  const event =
    change.field === "created"
      ? change.new
        ? `Added as a copy of ${String(change.new)}`
        : "Added"
      : change.field === "deleted"
        ? change.new
          ? "Deleted"
          : "Restored"
        : null;
  return (
    <li className="border-b border-line-row py-2 text-label">
      {event ? (
        <p className="font-medium text-ink">{event}</p>
      ) : (
        <p className="text-ink">
          <span className="font-medium">{FIELD_LABEL[change.field] ?? change.field}</span>:{" "}
          <span className="text-ink-muted line-through decoration-ink-faint">{show(change.field, change.old)}</span> →{" "}
          <span className="num font-medium">{show(change.field, change.new)}</span>
        </p>
      )}
      <p className="mt-0.5 text-caption text-ink-subtle">
        {change.byName} · {when(change.at)}
        {change.reason ? ` · “${change.reason}”` : ""}
      </p>
    </li>
  );
}
