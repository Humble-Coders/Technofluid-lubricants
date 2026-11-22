import clsx from "clsx";
import { Plus, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { financialYear, formatINR, indiaDate } from "@technofluid/core";
import { Button, EmptyState, ErrorState, FilterSelect, Input, LoadingState, Page, PageHeader, SearchInput, StatTile, StatTiles, Table, TableFooter, Td, Th, Tr } from "@/components/ui";
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
    <Page>
      <PageHeader
        title="Suppliers & purchases"
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => navigate("/purchases/new")}>
            New purchase
          </Button>
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder="PB ref, bill no., supplier or GSTIN" aria-label="Search" />
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
              label="Paid"
              value={filter}
              onChange={(v) => setFilter(v as PaidFilter)}
              options={[
                ["all", "All bills"],
                ["UNPAID", "Unpaid"],
                ["PART_PAID", "Part paid"],
                ["PAID", "Paid"],
                ["CANCELLED", "Cancelled"],
              ]}
            />
          </>
        }
      />

      <StatTiles>
        <StatTile label="Bills" value={String(live.length)} loading={purchases.status === "loading"} />
        <StatTile label="Purchases in these dates" value={formatINR(bought)} loading={purchases.status === "loading"} />
        <StatTile label="Still to pay on these" value={formatINR(due)} tone={due > 0 ? "warning" : undefined} loading={purchases.status === "loading"} />
      </StatTiles>

      {purchases.status === "loading" ? (
        <LoadingState />
      ) : purchases.status === "error" ? (
        <ErrorState>{purchases.message}</ErrorState>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Truck />} title={rows.length ? "No bill matches" : "No purchases in these dates"}>
          {rows.length ? "Try other words or another filter." : "Record a supplier's bill with New purchase."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Ref</Th>
                <Th>Bill no.</Th>
                <Th>Bill date</Th>
                <Th>Supplier</Th>
                <Th align="right">Total</Th>
                <Th>Paid</Th>
                <Th>Books</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const pp = paid.get(p.id);
                const off = p.status === "CANCELLED" ? "text-ink-subtle" : undefined;
                return (
                  <Tr key={p.id} onOpen={() => navigate(`/purchases/${p.id}`)}>
                    <Td className={clsx("num font-medium whitespace-nowrap", off, p.status === "CANCELLED" && "line-through")}>{p.ref}</Td>
                    <Td className={clsx("whitespace-nowrap", off)}>{p.billNo}</Td>
                    <Td className={clsx("num whitespace-nowrap", off)}>{p.billDate}</Td>
                    <Td className={off}>{p.supplier.name}</Td>
                    <Td num className={off}>
                      {formatINR(p.billTotalPaise)}
                    </Td>
                    <Td>{pp ? <PaidBadge paid={pp} /> : null}</Td>
                    <Td>
                      <PurchaseBooksStatus purchase={p} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <TableFooter shown={shown.length} total={rows.length} noun={rows.length === 1 ? "bill" : "bills"} />
        </>
      )}
    </Page>
  );
}
