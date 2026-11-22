import clsx from "clsx";
import { Plus, ReceiptIndianRupee } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { financialYear, formatINR, indiaDate } from "@technofluid/core";
import { Banner, Button, EmptyState, ErrorState, FilterSelect, Input, LoadingState, Page, PageHeader, SearchInput, StatTile, StatTiles, Table, TableFooter, Td, Th, Tr } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { rangeFor } from "@/features/money/MoneyScreen";
import { useCompany, useSales, useSalesPaid } from "@/hooks/useSales";
import { BooksStatus, PaidBadge } from "./saleBadges";

type Preset = "today" | "week" | "month" | "fy" | "custom";
type PaidFilter = "all" | "UNPAID" | "PART_PAID" | "PAID" | "CANCELLED";

/** 1 April of the financial year `day` falls in. */
const fyStart = (day: string) => `${financialYear(day).slice(0, 4)}-04-01`;

/**
 * Sales & invoices (Admin, Accounts): every invoice in a date range with what's been
 * paid on it (worked out from our records) and its state in the books. New sale opens
 * the billing screen; a row opens the invoice.
 */
export function SalesScreen() {
  const { role } = useStaff();
  const navigate = useNavigate();
  const today = indiaDate();
  const company = useCompany();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<[string, string]>([`${today.slice(0, 7)}-01`, today]);
  const [from, to] = preset === "custom" ? custom : preset === "fy" ? [fyStart(today), today] : rangeFor(preset, today);
  const sales = useSales(from, to);
  const rows = useMemo(() => (sales.status === "ready" ? sales.data : []), [sales]);
  const paid = useSalesPaid(rows);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PaidFilter>("all");

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((s) => {
      const p = paid.get(s.id);
      if (filter !== "all" && p?.state !== filter) return false;
      const text = `${s.invoiceNo} ${s.customer.name} ${s.customer.buyer?.name ?? ""} ${s.customer.buyer?.phone ?? ""} ${s.customer.gstin ?? ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [rows, paid, search, filter]);

  const live = rows.filter((s) => s.status === "ACTIVE");
  const billed = live.reduce((sum, s) => sum + s.totals.grandTotalPaise, 0);
  const due = live.reduce((sum, s) => sum + (paid.get(s.id)?.duePaise ?? 0), 0);
  const noCompany = company.status === "ready" && !company.data;

  return (
    <Page>
      <PageHeader
        title="Sales & invoices"
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => navigate("/sales/new")} disabled={noCompany}>
            New sale
          </Button>
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder="Invoice no., customer or GSTIN" aria-label="Search" />
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
            <FilterSelect
              label="Show"
              value={filter}
              onChange={(v) => setFilter(v as PaidFilter)}
              options={[
                ["all", "All invoices"],
                ["UNPAID", "Unpaid"],
                ["PART_PAID", "Part paid"],
                ["PAID", "Paid"],
                ["CANCELLED", "Cancelled"],
              ]}
            />
          </>
        }
      />

      {noCompany ? (
        <Banner tone="warning" className="mb-6">
          The company details printed on invoices (legal name, GSTIN, address) aren't set up yet —{" "}
          {role === "admin" ? (
            <Link to="/settings" className="font-medium underline">
              fill them in under Settings
            </Link>
          ) : (
            "ask an Admin to fill them in under Settings"
          )}{" "}
          before billing.
        </Banner>
      ) : null}

      <StatTiles>
        <StatTile label="Invoices" value={live.length.toLocaleString("en-IN")} loading={sales.status === "loading"} />
        <StatTile label="Billed" value={formatINR(billed)} loading={sales.status === "loading"} />
        <StatTile label="Still due on these" value={formatINR(due)} loading={sales.status === "loading"} tone={due > 0 ? "warning" : undefined} />
      </StatTiles>

      {sales.status === "loading" ? (
        <LoadingState />
      ) : sales.status === "error" ? (
        <ErrorState>{sales.message}</ErrorState>
      ) : shown.length === 0 ? (
        <EmptyState icon={<ReceiptIndianRupee />} title={rows.length ? "No invoice matches" : "No invoices in these dates"}>
          {rows.length ? "Try other words or another filter." : "Bill a customer with New sale."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th align="right">Total</Th>
                <Th>Paid</Th>
                <Th>Books</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const p = paid.get(s.id);
                const cancelled = s.status === "CANCELLED";
                return (
                  <Tr key={s.id} onOpen={() => navigate(`/sales/${s.id}`)}>
                    <Td muted={cancelled} className={clsx("num font-medium whitespace-nowrap", cancelled && "line-through")}>
                      {s.invoiceNo}
                    </Td>
                    <Td muted={cancelled} className="num whitespace-nowrap">
                      {s.invoiceDate}
                    </Td>
                    <Td muted={cancelled}>{s.customer.buyer?.name ? `${s.customer.buyer.name} (walk-in)` : s.customer.name}</Td>
                    <Td muted={cancelled} num>
                      {formatINR(s.totals.grandTotalPaise)}
                    </Td>
                    <Td>{p ? <PaidBadge paid={p} /> : null}</Td>
                    <Td>
                      <BooksStatus sale={s} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <TableFooter shown={shown.length} total={rows.length} noun={rows.length === 1 ? "invoice" : "invoices"} />
        </>
      )}
    </Page>
  );
}
