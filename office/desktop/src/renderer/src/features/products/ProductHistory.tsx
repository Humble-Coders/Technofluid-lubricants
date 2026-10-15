import { History } from "lucide-react";
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
};

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return field === "dealerPrice" || field === "distributorPrice" ? "No price" : "—";
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
      <h3 className="mb-2 flex items-center gap-1.5 text-2xs font-medium tracking-wide text-ink-muted uppercase">
        <History className="size-3.5" /> Change history
      </h3>
      {state.status === "loading" ? (
        <Spinner />
      ) : state.status === "error" ? (
        <p className="text-[12px] text-danger">Couldn't load the history: {state.message}</p>
      ) : state.data.length === 0 ? (
        <p className="text-[12px] text-ink-muted">Not changed in Technofluid Office yet.</p>
      ) : (
        <ol className="space-y-2">
          {state.data.map((change) => (
            <ChangeRow key={change.id} change={change} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ChangeRow({ change }: { change: ProductChange }) {
  return (
    <li className="rounded bg-canvas px-2.5 py-1.5 text-[12px]">
      <p className="text-ink">
        <span className="font-medium">{FIELD_LABEL[change.field] ?? change.field}</span>:{" "}
        <span className="text-ink-muted line-through decoration-ink-faint">{show(change.field, change.old)}</span> →{" "}
        <span className="num font-medium">{show(change.field, change.new)}</span>
      </p>
      <p className="text-2xs text-ink-faint">
        {change.byName} · {when(change.at)}
        {change.reason ? ` · “${change.reason}”` : ""}
      </p>
    </li>
  );
}
