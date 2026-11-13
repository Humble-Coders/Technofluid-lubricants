import clsx from "clsx";
import { Plus, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { financialYear, formatINR, indiaDate } from "@technofluid/core";
import { Button, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { rangeFor } from "@/features/money/MoneyScreen";
import { PaidBadge } from "@/features/sales/saleBadges";
import { usePurchases, usePurchasesPaid } from "@/hooks/usePurchases";
import { PurchaseBooksStatus } from "./purchaseBadges";

type Preset = "today" | "week" | "month" | "fy" | "custom";
type PaidFilter = "all" | "UNPAID" | "PART_PAID" | "PAID" | "CANCELLED";

const fyStart = (day: string) => `${financialYear(day).slice(0, 4)}-04-01`;

/**
 * Suppliers & purchases (Admin, Accounts): every supplier bill in a date range, with
 * what's been paid on it (from our records) and its state in the books. New purchase
 * opens the bill form; a row opens the bill.
 */
export function PurchasesScreen() {
  const navigate = useNavigate();
  const today = indiaDate();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<[string, string]>([`${today.slice(0, 7)}-01`, today]);
  const [from, to] = preset === "custom" ? custom : preset === "fy" ? [fyStart(today), today] : rangeFor(preset, today);
  const purchases = usePurchases(from, to);
  const rows = useMemo(() => (purchases.status === "ready" ? purchases.data : []), [purchases]);
  const paid = usePurchasesPaid(rows);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PaidFilter>("all");

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((p) => {
      if (filter !== "all" && paid.get(p.id)?.state !== filter) return false;
      const text = `${p.ref} ${p.billNo} ${p.supplier.name} ${p.supplier.gstin ?? ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [rows, paid, search, filter]);

  const live = rows.filter((p) => p.status === "ACTIVE");
  const bought = live.reduce((sum, p) => sum + p.billTotalPaise, 0);
  const due = live.reduce((sum, p) => sum + (paid.get(p.id)?.duePaise ?? 0), 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Stat label="Bills" value={String(live.length)} />
          <Stat label="Purchases in these dates" value={formatINR(bought)} />
          <Stat label="Still to pay on these" value={formatINR(due)} tone={due > 0 ? "warning" : undefined} />
          <span className="flex-1" />
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => navigate("/purchases/new")}>
            New purchase
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PB ref, bill no., supplier or GSTIN" leading={<Search className="size-3.5" />} className="w-72" aria-label="Search" />
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
            <option value="all">All bills</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PART_PAID">Part paid</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>

        {purchases.status === "loading" ? (
          <Spinner />
        ) : purchases.status === "error" ? (
          <p className="text-[12px] text-danger">{purchases.message}</p>
        ) : shown.length === 0 ? (
          <EmptyState icon={<Truck className="size-6" />} title={rows.length ? "No bill matches" : "No purchases in these dates"}>
            {rows.length ? "Try other words or another filter." : "Record a supplier's bill with New purchase."}
          </EmptyState>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Ref</th>
                <th className="py-2 pr-3 font-medium">Bill no.</th>
                <th className="py-2 pr-3 font-medium">Bill date</th>
                <th className="py-2 pr-3 font-medium">Supplier</th>
                <th className="py-2 pr-3 text-right font-medium">Total</th>
                <th className="py-2 pr-3 font-medium">Paid</th>
                <th className="py-2 font-medium">Books</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const pp = paid.get(p.id);
                return (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    onClick={() => navigate(`/purchases/${p.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/purchases/${p.id}`)}
                    className={clsx("cursor-pointer border-b border-line/70 hover:bg-hover focus:bg-hover focus:outline-none", p.status === "CANCELLED" && "text-ink-faint")}
                  >
                    <td className={clsx("num py-2 pr-3 font-medium whitespace-nowrap", p.status === "CANCELLED" && "line-through")}>{p.ref}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{p.billNo}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{p.billDate}</td>
                    <td className="py-2 pr-3">{p.supplier.name}</td>
                    <td className="num py-2 pr-3 text-right">{formatINR(p.billTotalPaise)}</td>
                    <td className="py-2 pr-3">{pp ? <PaidBadge paid={pp} /> : null}</td>
                    <td className="py-2">
                      <PurchaseBooksStatus purchase={p} />
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
