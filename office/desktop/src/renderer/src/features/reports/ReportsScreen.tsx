import { useState } from "react";
import { Segmented } from "@/components/ui";
import { MoneyOwedReportView } from "./MoneyOwedReport";
import { SalesReportView } from "./SalesReport";
import { StockValueReportView } from "./StockValueReport";

type Tab = "owed" | "sales" | "stock";

/**
 * Reports (Admin, Accounts — brief: docs/office/reports-brief.md): money owed, sales by
 * product, stock value. Read-only: each report is read once and refreshed on demand;
 * nothing is written and nothing goes to the books.
 */
export function ReportsScreen() {
  const [tab, setTab] = useState<Tab>("owed");
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 bg-surface px-5 pt-3 pb-1">
        <Segmented
          wide
          value={tab}
          onChange={setTab}
          options={[
            ["owed", "Money owed"],
            ["sales", "Sales by product"],
            ["stock", "Stock value"],
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "owed" ? <MoneyOwedReportView /> : tab === "sales" ? <SalesReportView /> : <StockValueReportView />}
      </div>
    </div>
  );
}
