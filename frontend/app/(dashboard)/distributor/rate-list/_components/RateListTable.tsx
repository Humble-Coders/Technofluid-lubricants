// File: frontend/app/(dashboard)/distributor/rate-list/_components/RateListTable.tsx
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";
import type { RateListEntry } from "@/types/product";
import type { Product } from "@/types/product";

type RateListTableProps = {
  entries: RateListEntry[];
  products: Product[];
  loading?: boolean;
};

export function RateListTable({
  entries,
  products,
  loading = false,
}: RateListTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">Loading...</div>
    );
  }

  // Merge rate list entries with products: prefer distributor-specific price,
  // fall back to product base price
  const productMap = new Map(products.map((p) => [p.id, p]));
  const rateMap = new Map(entries.map((e) => [e.productId, e]));

  // Combine: show all products, using rate list price where available
  const rows = products.map((product) => {
    const rateEntry = rateMap.get(product.id);
    return {
      productId: product.id,
      productName: product.name,
      category: product.category ?? "—",
      unit: rateEntry?.unit ?? product.unit,
      price: rateEntry?.price ?? product.basePrice,
      isCustom: !!rateEntry,
    };
  });

  // Also add any rate list entries for products not in the product list
  for (const entry of entries) {
    if (!productMap.has(entry.productId)) {
      rows.push({
        productId: entry.productId,
        productName: entry.productName,
        category: "—",
        unit: entry.unit,
        price: entry.price,
        isCustom: true,
      });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-textSecondary">
        No pricing information available.
      </div>
    );
  }

  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Product</TH>
          <TH>Category</TH>
          <TH>Unit</TH>
          <TH>Your Price</TH>
          <TH>Pricing</TH>
        </tr>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <tr key={row.productId}>
            <TD className="font-medium">{row.productName}</TD>
            <TD className="text-sm text-textSecondary">{row.category}</TD>
            <TD className="text-sm text-textSecondary">{row.unit}</TD>
            <TD className="font-semibold text-textPrimary">
              ${row.price.toLocaleString()}
            </TD>
            <TD>
              {row.isCustom ? (
                <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                  Special Rate
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-textSecondary/10 px-2.5 py-1 text-xs font-medium text-textSecondary">
                  Standard
                </span>
              )}
            </TD>
          </tr>
        ))}
      </TableBody>
    </Table>
  );
}
