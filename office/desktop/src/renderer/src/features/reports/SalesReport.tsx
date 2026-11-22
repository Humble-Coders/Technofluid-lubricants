import { Check, ReceiptIndianRupee } from "lucide-react";
import { useState } from "react";
import { financialYear, formatINR, indiaDate, milliCsv, paiseCsv, toCsv, type SalesGroupBy } from "@technofluid/core";
import { Banner, EmptyState, FilterSelect, Input, Segmented, StatTiles, Table, Td, Th, Tr } from "@/components/ui";
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
  // The list holds the customers billed in these dates; the chosen one stays in it (by a few words) while it reloads or if they weren't billed.
  const customerOptions: Array<[string, string]> = [["", "All customers"], ...(r?.customers ?? []).map((c): [string, string] => [c.entityId, c.name])];
  if (customer && !customerOptions.some(([id]) => id === customer)) customerOptions.push([customer, r ? "Not billed in these dates" : "…"]);

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
    <>
      <ReportBar asOf={state.status === "ready" ? state.asOf : null} loading={state.status === "loading"} onRefresh={refresh} csv={csv}>
        <FilterSelect
          label="Dates"
          value={preset}
          onChange={(v) => setPreset(v as Preset)}
          active={preset !== "month"}
          options={[
            ["today", "Today"],
            ["week", "Last 7 days"],
            ["month", "This month"],
            ["fy", "This financial year"],
            ["custom", "Custom…"],
          ]}
        />
        {preset === "custom" ? (
          <>
            <Input type="date" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} aria-label="From" className="w-36" />
            <span className="text-ink-muted">–</span>
            <Input type="date" value={custom[1]} min={custom[0]} max={today} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} aria-label="To" className="w-36" />
          </>
        ) : null}
        <FilterSelect label="Customer" value={customer} onChange={setCustomer} options={customerOptions} />
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
          <StatTiles>
            <Stat label="Invoices" value={String(r.invoiceCount)} hint={r.cancelledCount ? `${r.cancelledCount} cancelled left out` : `${from} – ${to}`} />
            <Stat label="Taxable value" value={formatINR(r.totals.taxablePaise)} />
            <Stat label="GST" value={formatINR(r.totals.gstPaise)} />
            <Stat label="Total billed" value={formatINR(r.totals.totalPaise)} />
          </StatTiles>

          {r.invoiceCount === 0 ? (
            <EmptyState icon={<ReceiptIndianRupee />} title="No invoices in these dates">
              {r.cancelledCount ? `${r.cancelledCount} cancelled invoice${r.cancelledCount === 1 ? "" : "s"} left out.` : "Pick other dates or another customer."}
            </EmptyState>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>{h1}</Th>
                    <Th>{h2}</Th>
                    <Th align="right">Packs</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Taxable</Th>
                    <Th align="right">GST</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((x) => (
                    <Tr key={x.key}>
                      <Td>{x.label}</Td>
                      <Td muted>{x.detail}</Td>
                      <Td num>{x.packs ?? "-"}</Td>
                      <Td num className="whitespace-nowrap">
                        {quantities(x.qtyMilli)}
                      </Td>
                      <Td num>{formatINR(x.taxablePaise)}</Td>
                      <Td num>{formatINR(x.gstPaise)}</Td>
                      <Td num>{formatINR(x.totalPaise)}</Td>
                    </Tr>
                  ))}
                  <Tr>
                    <Td muted colSpan={4}>
                      Freight
                    </Td>
                    <Td num muted>
                      {formatINR(r.freight.taxablePaise)}
                    </Td>
                    <Td num muted>
                      {formatINR(r.freight.gstPaise)}
                    </Td>
                    <Td num muted>
                      {formatINR(r.freight.totalPaise)}
                    </Td>
                  </Tr>
                  <Tr>
                    <Td muted colSpan={6}>
                      Round-off
                    </Td>
                    <Td num muted>
                      {formatINR(r.roundOffPaise)}
                    </Td>
                  </Tr>
                  <Tr>
                    <Td colSpan={4} className="border-b-0 font-semibold">
                      Total
                    </Td>
                    <Td num className="border-b-0 font-semibold">
                      {formatINR(r.totals.taxablePaise)}
                    </Td>
                    <Td num className="border-b-0 font-semibold">
                      {formatINR(r.totals.gstPaise)}
                    </Td>
                    <Td num className="border-b-0 font-semibold">
                      {formatINR(r.totals.totalPaise)}
                    </Td>
                  </Tr>
                </tbody>
              </Table>
              {r.matches ? (
                <p className="mt-4 flex items-center gap-1.5 text-label text-ink-muted">
                  <Check className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                  {`Adds up: the report total equals the ${r.invoiceCount} invoice${r.invoiceCount === 1 ? "" : "s"}' total (${formatINR(r.invoicesTotalPaise)}) to the paisa.`}
                </p>
              ) : (
                <Banner tone="danger" className="mt-4">
                  {`Doesn't add up: the report total is ${formatINR(r.totals.totalPaise)} but the invoices' total is ${formatINR(r.invoicesTotalPaise)}. Tell the developers.`}
                </Banner>
              )}
            </>
          )}
        </>
      ) : null}
    </>
  );
}
