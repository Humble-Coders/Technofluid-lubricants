import clsx from "clsx";
import { CheckCircle2, ReceiptIndianRupee, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { financialYear, formatINR, indiaDate, milliCsv, paiseCsv, toCsv, type SalesGroupBy } from "@technofluid/core";
import { EmptyState, Input, Segmented, Select } from "@/components/ui";
import { rangeFor } from "@/features/money/MoneyScreen";
import { useSalesReport } from "@/hooks/useReports";
import { NotReady, quantities, ReportBar, Stat } from "./reportParts";

type Preset = "today" | "week" | "month" | "fy" | "custom";

const GROUP_HEAD: Record<SalesGroupBy, [string, string]> = { pack: ["Product", "Pack"], product: ["Product", "Packs"], customer: ["Customer", "Invoices"] };

/**
 * Sales by product: the frozen figures of the active invoices in a date range (never
 * re-priced), by pack, product or customer, with freight and round-off on their own rows
 * and a check that the report adds up to the invoices' total to the paisa.
 */
export function SalesReportView() {
  const today = indiaDate();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<[string, string]>([`${today.slice(0, 7)}-01`, today]);
  const [from, to] = preset === "custom" ? custom : preset === "fy" ? [`${financialYear(today).slice(0, 4)}-04-01`, today] : rangeFor(preset, today);
  const [groupBy, setGroupBy] = useState<SalesGroupBy>("pack");
  const [customer, setCustomer] = useState<string>("");
  const { state, refresh } = useSalesReport(from, to, groupBy, customer || null);
  const r = state.status === "ready" ? state.data : null;
  const [h1, h2] = GROUP_HEAD[groupBy];

  const csv = r
    ? () => {
        const who = customer ? r.customers.find((c) => c.entityId === customer)?.name : null;
        const rows: (string | number | null)[][] = [[h1, h2, "Packs", "Litres", "Kg", "Pieces", "Taxable", "GST", "Total"]];
        for (const x of r.rows) rows.push([x.label, x.detail, x.packs, x.qtyMilli.L !== undefined ? milliCsv(x.qtyMilli.L) : null, x.qtyMilli.kg !== undefined ? milliCsv(x.qtyMilli.kg) : null, x.qtyMilli.piece !== undefined ? milliCsv(x.qtyMilli.piece) : null, paiseCsv(x.taxablePaise), paiseCsv(x.gstPaise), paiseCsv(x.totalPaise)]);
        rows.push(["Freight", null, null, null, null, null, paiseCsv(r.freight.taxablePaise), paiseCsv(r.freight.gstPaise), paiseCsv(r.freight.totalPaise)]);
        rows.push(["Round-off", null, null, null, null, null, null, null, paiseCsv(r.roundOffPaise)]);
        rows.push(["Total", `${r.invoiceCount} invoices${r.cancelledCount ? `, ${r.cancelledCount} cancelled left out` : ""}`, null, null, null, null, paiseCsv(r.totals.taxablePaise), paiseCsv(r.totals.gstPaise), paiseCsv(r.totals.totalPaise)]);
        return { fileName: `Sales by ${groupBy} ${from} to ${to}${who ? ` ${who}` : ""}`, text: toCsv(rows) };
      }
    : null;

  return (
    <div className="space-y-4 px-5 py-4">
      <ReportBar asOf={state.status === "ready" ? state.asOf : null} loading={state.status === "loading"} onRefresh={refresh} csv={csv}>
        <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Dates" className="w-40">
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">This month</option>
          <option value="fy">This financial year</option>
          <option value="custom">Custom…</option>
        </Select>
        {preset === "custom" ? (
          <>
            <Input type="date" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} aria-label="From" className="w-36" />
            <span className="text-ink-muted">–</span>
            <Input type="date" value={custom[1]} min={custom[0]} max={today} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} aria-label="To" className="w-36" />
          </>
        ) : null}
        <Select value={customer} onChange={(e) => setCustomer(e.target.value)} aria-label="Customer" className="w-56">
          <option value="">All customers</option>
          {(r?.customers ?? []).map((c) => (
            <option key={c.entityId} value={c.entityId}>
              {c.name}
            </option>
          ))}
        </Select>
        <Segmented
          value={groupBy}
          onChange={setGroupBy}
          options={[
            ["pack", "By pack"],
            ["product", "By product"],
            ["customer", "By customer"],
          ]}
        />
      </ReportBar>
      <NotReady state={state} onRetry={refresh} />
      {r ? (
        <>
          <div className="flex flex-wrap gap-3">
            <Stat label="Invoices" value={String(r.invoiceCount)} hint={r.cancelledCount ? `${r.cancelledCount} cancelled left out` : `${from} – ${to}`} />
            <Stat label="Taxable value" value={formatINR(r.totals.taxablePaise)} />
            <Stat label="GST" value={formatINR(r.totals.gstPaise)} />
            <Stat label="Total billed" value={formatINR(r.totals.totalPaise)} />
          </div>

          {r.invoiceCount === 0 ? (
            <EmptyState icon={<ReceiptIndianRupee className="size-6" />} title="No invoices in these dates">
              {r.cancelledCount ? `${r.cancelledCount} cancelled invoice${r.cancelledCount === 1 ? "" : "s"} left out.` : "Pick other dates or another customer."}
            </EmptyState>
          ) : (
            <>
              <table className="w-full border-collapse text-[13px]">
                <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 font-medium">{h1}</th>
                    <th className="py-2 pr-3 font-medium">{h2}</th>
                    <th className="py-2 pr-3 text-right font-medium">Packs</th>
                    <th className="py-2 pr-3 text-right font-medium">Quantity</th>
                    <th className="py-2 pr-3 text-right font-medium">Taxable</th>
                    <th className="py-2 pr-3 text-right font-medium">GST</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((x) => (
                    <tr key={x.key} className="border-b border-line/70">
                      <td className="py-1.5 pr-3">{x.label}</td>
                      <td className="py-1.5 pr-3 text-ink-muted">{x.detail}</td>
                      <td className="num py-1.5 pr-3 text-right">{x.packs ?? "—"}</td>
                      <td className="num py-1.5 pr-3 text-right whitespace-nowrap">{quantities(x.qtyMilli)}</td>
                      <td className="num py-1.5 pr-3 text-right">{formatINR(x.taxablePaise)}</td>
                      <td className="num py-1.5 pr-3 text-right">{formatINR(x.gstPaise)}</td>
                      <td className="num py-1.5 text-right">{formatINR(x.totalPaise)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-line/70 text-ink-muted">
                    <td className="py-1.5 pr-3" colSpan={4}>
                      Freight
                    </td>
                    <td className="num py-1.5 pr-3 text-right">{formatINR(r.freight.taxablePaise)}</td>
                    <td className="num py-1.5 pr-3 text-right">{formatINR(r.freight.gstPaise)}</td>
                    <td className="num py-1.5 text-right">{formatINR(r.freight.totalPaise)}</td>
                  </tr>
                  <tr className="border-b border-line/70 text-ink-muted">
                    <td className="py-1.5 pr-3" colSpan={6}>
                      Round-off
                    </td>
                    <td className="num py-1.5 text-right">{formatINR(r.roundOffPaise)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2 pr-3" colSpan={4}>
                      Total
                    </td>
                    <td className="num py-2 pr-3 text-right">{formatINR(r.totals.taxablePaise)}</td>
                    <td className="num py-2 pr-3 text-right">{formatINR(r.totals.gstPaise)}</td>
                    <td className="num py-2 text-right">{formatINR(r.totals.totalPaise)}</td>
                  </tr>
                </tbody>
              </table>
              <p className={clsx("flex items-center gap-1.5 text-[12px]", r.matches ? "text-success" : "text-danger")}>
                {r.matches ? <CheckCircle2 className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
                {r.matches
                  ? `Adds up: the report total equals the ${r.invoiceCount} invoice${r.invoiceCount === 1 ? "" : "s"}' total (${formatINR(r.invoicesTotalPaise)}) to the paisa.`
                  : `Doesn't add up: the report total is ${formatINR(r.totals.totalPaise)} but the invoices' total is ${formatINR(r.invoicesTotalPaise)}. Tell the developers.`}
              </p>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
