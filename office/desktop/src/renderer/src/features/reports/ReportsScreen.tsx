import { useState } from "react";
import { Page, PageHeader, Tabs } from "@/components/ui";
import { MoneyOwedReportView } from "./MoneyOwedReport";
import { ReportActionsSlot } from "./reportParts";
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
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  return (
    <Page>
      <PageHeader title="Reports" actions={<div ref={setActions} className="flex items-center gap-2" />} />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        options={[
          ["owed", "Money owed"],
          ["sales", "Sales by product"],
          ["stock", "Stock value"],
        ]}
      />
      <ReportActionsSlot.Provider value={actions}>{tab === "owed" ? <MoneyOwedReportView /> : tab === "sales" ? <SalesReportView /> : <StockValueReportView />}</ReportActionsSlot.Provider>
    </Page>
  );
}
