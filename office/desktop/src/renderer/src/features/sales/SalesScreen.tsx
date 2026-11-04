import clsx from "clsx";
import { Plus, ReceiptIndianRupee, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { financialYear, formatINR, indiaDate } from "@technofluid/core";
import { Button, EmptyState, Input, Select, Spinner } from "@/components/ui";
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
      const text = `${s.invoiceNo} ${s.customer.name} ${s.customer.gstin ?? ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [rows, paid, search, filter]);

  const live = rows.filter((s) => s.status === "ACTIVE");
  const billed = live.reduce((sum, s) => sum + s.totals.grandTotalPaise, 0);
  const due = live.reduce((sum, s) => sum + (paid.get(s.id)?.duePaise ?? 0), 0);
  const noCompany = company.status === "ready" && !company.data;

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 px-5 py-4">
        {noCompany ? (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
            The company details printed on invoices (legal name, GSTIN, address) aren't set up yet —{" "}
            {role === "admin" ? (
              <Link to="/settings" className="font-medium underline">
                fill them in under Settings
              </Link>
            ) : (
              "ask an Admin to fill them in under Settings"
            )}{" "}
            before billing.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Stat label="Invoices" value={String(live.length)} />
          <Stat label="Billed" value={formatINR(billed)} />
          <Stat label="Still due on these" value={formatINR(due)} tone={due > 0 ? "warning" : undefined} />
          <span className="flex-1" />
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => navigate("/sales/new")} disabled={noCompany}>
            New sale
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice no., customer or GSTIN" leading={<Search className="size-3.5" />} className="w-72" aria-label="Search" />
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
          <Select value={filter} onChange={(e) => setFilter(e.target.value as PaidFilter)} aria-label="Paid" className="w-36">
            <option value="all">All invoices</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PART_PAID">Part paid</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>

        {sales.status === "loading" ? (
          <Spinner />
        ) : sales.status === "error" ? (
          <p className="text-[12px] text-danger">{sales.message}</p>
        ) : shown.length === 0 ? (
          <EmptyState icon={<ReceiptIndianRupee className="size-6" />} title={rows.length ? "No invoice matches" : "No invoices in these dates"}>
            {rows.length ? "Try other words or another filter." : "Bill a customer with New sale."}
          </EmptyState>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Invoice</th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="py-2 pr-3 text-right font-medium">Total</th>
                <th className="py-2 pr-3 font-medium">Paid</th>
                <th className="py-2 font-medium">Books</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const p = paid.get(s.id);
                return (
                  <tr
                    key={s.id}
                    tabIndex={0}
                    onClick={() => navigate(`/sales/${s.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/sales/${s.id}`)}
                    className={clsx("cursor-pointer border-b border-line/70 hover:bg-hover focus:bg-hover focus:outline-none", s.status === "CANCELLED" && "text-ink-faint")}
                  >
                    <td className={clsx("num py-2 pr-3 font-medium whitespace-nowrap", s.status === "CANCELLED" && "line-through")}>{s.invoiceNo}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{s.invoiceDate}</td>
                    <td className="py-2 pr-3">{s.customer.name}</td>
                    <td className="num py-2 pr-3 text-right">{formatINR(s.totals.grandTotalPaise)}</td>
                    <td className="py-2 pr-3">{p ? <PaidBadge paid={p} /> : null}</td>
                    <td className="py-2">
                      <BooksStatus sale={s} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-2.5">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={clsx("num text-[18px] font-semibold", tone === "warning" ? "text-warning" : "text-ink")}>{value}</p>
    </div>
  );
}
