// File: frontend/app/(dashboard)/admin/products/_components/ImportPreview.tsx
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, TableHead, TableBody, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ProductImportResult } from "@/lib/services/productImport";

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function ImportPreview({ result }: { result: ProductImportResult }) {
  const { valid, invalid } = result;

  const categoryTally = valid.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});
  const segmentTally = valid.reduce<Record<string, number>>((acc, p) => {
    acc[p.segment] = (acc[p.segment] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardTitle>Valid rows</CardTitle>
          <CardValue>{valid.length}</CardValue>
        </Card>
        <Card>
          <CardTitle>Invalid rows</CardTitle>
          <CardValue>{invalid.length}</CardValue>
        </Card>
        <Card>
          <CardTitle>By category</CardTitle>
          <p className="mt-2 text-sm text-textPrimary">
            bulk_oil {categoryTally.bulk_oil ?? 0} · grease{" "}
            {categoryTally.grease ?? 0} · retail {categoryTally.retail ?? 0}
          </p>
        </Card>
        <Card>
          <CardTitle>By segment</CardTitle>
          <p className="mt-2 text-sm text-textPrimary">
            Automotive {segmentTally.Automotive ?? 0} · Industrial{" "}
            {segmentTally.Industrial ?? 0} · Both {segmentTally.Both ?? 0}
          </p>
        </Card>
      </div>

      {invalid.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-textPrimary">
            Invalid rows (excluded from import)
          </h3>
          <Table>
            <TableHead>
              <tr>
                <TH>Row</TH>
                <TH>SKU</TH>
                <TH>Reason</TH>
              </tr>
            </TableHead>
            <TableBody>
              {invalid.map((row) => (
                <tr key={row.rowNumber} className="bg-danger/5">
                  <TD>{row.rowNumber}</TD>
                  <TD>{String(row.raw["SKU"] ?? "")}</TD>
                  <TD>
                    <Badge variant="danger">{row.reason}</Badge>
                  </TD>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-textPrimary">
          Valid rows ({valid.length})
        </h3>
        <Table>
          <TableHead>
            <tr>
              <TH>SKU</TH>
              <TH>Product</TH>
              <TH>Category</TH>
              <TH>Segment</TH>
              <TH>Dealer</TH>
              <TH>Distributor</TH>
            </tr>
          </TableHead>
          <TableBody>
            {valid.map((p) => (
              <tr key={p.sku}>
                <TD>{p.sku}</TD>
                <TD>
                  {p.product}{" "}
                  <span className="text-textSecondary">
                    ({p.orderableUnit})
                  </span>
                </TD>
                <TD>{p.category}</TD>
                <TD>{p.segment}</TD>
                <TD>{formatPaise(p.dealerPrice)}</TD>
                <TD>{formatPaise(p.distributorPrice)}</TD>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
