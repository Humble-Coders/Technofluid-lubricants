import clsx from "clsx";
import { Search, Wallet } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router";
import { AGE_BUCKET_LABEL, AGE_BUCKETS, formatINR, paiseCsv, toCsv, type PartyOwed } from "@technofluid/core";
import { Badge, EmptyState, Input, Segmented, Switch } from "@/components/ui";
import { useMoneyOwedReport } from "@/hooks/useReports";
import { fileDay, NotReady, ReportBar, Stat } from "./reportParts";

type Side = "owedToUs" | "weOwe";

const UNEXPLAINED = "Not found in our records (older than our date range, or entered directly in the books)";

/** What a balance means, in words: "owes us ₹…" / "we owe ₹…". */
const balanceText = (p: PartyOwed) => (p.balancePaise === null ? "Not in the books" : p.balancePaise > 0 ? `Owes us ${formatINR(p.balancePaise)}` : p.balancePaise < 0 ? `We owe ${formatINR(-p.balancePaise)}` : "Settled");

/**
 * Money owed: each party's balance from the books (customer-and-supplier nets to one
 * figure), the invoices and bills still open under it with their age, and the part of the
 * balance no open document explains — shown, never forced to match.
 */
export function MoneyOwedReportView() {
  const { state, refresh } = useMoneyOwedReport();
  const [side, setSide] = useState<Side>("owedToUs");
  const [showZero, setShowZero] = useState(false);
  const [search, setSearch] = useState("");
  const r = state.status === "ready" ? state.data : null;

  const parties = useMemo(() => {
    if (!r) return [];
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = [...r[side], ...(showZero ? r.settled : [])];
    return list.filter((p) => words.every((w) => `${p.name} ${p.documents.map((d) => `${d.ref} ${d.partyRef ?? ""}`).join(" ")}`.toLowerCase().includes(w)));
  }, [r, side, showZero, search]);

  const csv = r
    ? () => {
        const rows: (string | number | null)[][] = [["Side", "Party", "Balance in the books (+ owes us, - we owe)", "Document", "Supplier's bill no.", "Date", "Total", "Paid", "Due (+ owed to us, - we owe)", "Age (days)", "Age"]];
        const add = (label: string, list: PartyOwed[]) => {
          for (const p of list) {
            const bal = p.balancePaise === null ? "" : paiseCsv(p.balancePaise);
            for (const d of p.documents) rows.push([label, p.name, bal, d.ref, d.partyRef, d.date, paiseCsv(d.totalPaise), paiseCsv(d.paidPaise), paiseCsv(d.kind === "BILL" ? -d.duePaise : d.duePaise), d.ageDays, AGE_BUCKET_LABEL[d.bucket]]);
            for (const i of p.items) rows.push([label, p.name, bal, i.detail ? `${i.label} (${i.detail})` : i.label, null, i.date, null, null, paiseCsv(i.amountPaise), null, null]);
            if (p.unexplainedPaise !== 0) rows.push([label, p.name, bal, UNEXPLAINED, null, null, null, null, paiseCsv(p.unexplainedPaise), null, null]);
          }
        };
        add("Owed to us", r.owedToUs);
        add("We owe", r.weOwe);
        add("Settled / not in the books", r.settled);
        return { fileName: `Money owed ${fileDay(state.status === "ready" ? state.asOf : new Date())}`, text: toCsv(rows) };
      }
    : null;

  const hiddenWithDocs = r ? r.settled.filter((p) => p.documents.length > 0).length : 0;

  return (
    <div className="space-y-4 px-5 py-4">
      <ReportBar asOf={state.status === "ready" ? state.asOf : null} loading={state.status === "loading"} onRefresh={refresh} csv={csv} />
      <NotReady state={state} onRetry={refresh} />
      {r ? (
        <>
          <div className="flex flex-wrap gap-3">
            <Stat label="Owed to us" value={formatINR(r.owedToUsPaise)} hint={`${r.owedToUs.length} ${r.owedToUs.length === 1 ? "party" : "parties"} · from the books`} />
            <Stat label="We owe" value={formatINR(r.weOwePaise)} hint={`${r.weOwe.length} ${r.weOwe.length === 1 ? "party" : "parties"} · from the books`} />
          </div>

          <table className="w-full max-w-3xl border-collapse text-[13px]">
            <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-3 font-medium">Still due, by age</th>
                {AGE_BUCKETS.map((b) => (
                  <th key={b} className="py-1.5 pr-3 text-right font-medium">
                    {AGE_BUCKET_LABEL[b]}
                  </th>
                ))}
                <th className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Open invoices (owed to us)", r.invoiceAgeing],
                  ["Open bills (we owe)", r.billAgeing],
                ] as const
              ).map(([label, ageing]) => (
                <tr key={label} className="border-b border-line/70">
                  <td className="py-1.5 pr-3">{label}</td>
                  {AGE_BUCKETS.map((b) => (
                    <td key={b} className={clsx("num py-1.5 pr-3 text-right", b === "90+" && ageing[b] > 0 && "font-medium text-danger")}>
                      {ageing[b] ? formatINR(ageing[b]) : "—"}
                    </td>
                  ))}
                  <td className="num py-1.5 text-right font-medium">{formatINR(AGE_BUCKETS.reduce((s, b) => s + ageing[b], 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={side}
              onChange={setSide}
              options={[
                ["owedToUs", `Owed to us (${r.owedToUs.length})`],
                ["weOwe", `We owe (${r.weOwe.length})`],
              ]}
            />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Party, invoice or bill no." leading={<Search className="size-3.5" />} className="w-64" aria-label="Search" />
            <label className="flex items-center gap-2 text-[12px] text-ink-muted">
              <Switch checked={showZero} onChange={setShowZero} label="Show zero balances" />
              Show zero balances ({r.settled.length}
              {hiddenWithDocs ? `, ${hiddenWithDocs} with open documents` : ""})
            </label>
          </div>

          {parties.length === 0 ? (
            <EmptyState icon={<Wallet className="size-6" />} title={search ? "No party matches" : side === "owedToUs" ? "Nobody owes us anything" : "We don't owe anybody"}>
              {search ? "Try other words." : "Balances come from the books; turn on “Show zero balances” to see settled parties."}
            </EmptyState>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Party / document</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 pr-3 text-right font-medium">Paid</th>
                  <th className="py-2 pr-3 text-right font-medium">Due</th>
                  <th className="py-2 text-right font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => (
                  <Fragment key={p.entityId}>
                    <tr className="border-t-2 border-line bg-canvas/60">
                      <td className="py-2 pr-3 font-semibold" colSpan={4}>
                        {p.name}
                      </td>
                      <td className="num py-2 pr-3 text-right font-semibold whitespace-nowrap" colSpan={2}>
                        <span className={clsx(p.balancePaise !== null && p.balancePaise > 0 ? "text-ink" : p.balancePaise !== null && p.balancePaise < 0 ? "text-warning" : "text-ink-muted")}>{balanceText(p)}</span>
                      </td>
                    </tr>
                    {p.documents.map((d) => (
                      <tr key={d.id} className="border-b border-line/50">
                        <td className="py-1.5 pr-3 pl-4">
                          <Link to={d.kind === "INVOICE" ? `/sales/${d.id}` : `/purchases/${d.id}`} className="num font-medium hover:underline">
                            {d.ref}
                          </Link>
                          {d.partyRef ? <span className="ml-2 text-[12px] text-ink-muted">their bill {d.partyRef}</span> : null}
                          <Badge tone={d.kind === "INVOICE" ? "info" : "neutral"} className="ml-2">
                            {d.kind === "INVOICE" ? "Invoice" : "Bill"}
                          </Badge>
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{d.date}</td>
                        <td className="num py-1.5 pr-3 text-right">{formatINR(d.totalPaise)}</td>
                        <td className="num py-1.5 pr-3 text-right">{formatINR(d.paidPaise)}</td>
                        <td className="num py-1.5 pr-3 text-right font-medium">{d.kind === "BILL" ? `−${formatINR(d.duePaise)}` : formatINR(d.duePaise)}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <Badge tone={d.bucket === "90+" ? "danger" : d.bucket === "61-90" ? "warning" : "neutral"}>{d.ageDays} days</Badge>
                        </td>
                      </tr>
                    ))}
                    {p.items.map((i, n) => (
                      <tr key={`i${n}`} className="border-b border-line/50 text-ink-muted">
                        <td className="py-1.5 pr-3 pl-4">
                          {i.document ? (
                            <Link to={i.document.kind === "INVOICE" ? `/sales/${i.document.id}` : `/purchases/${i.document.id}`} className="text-ink hover:underline">
                              {i.label}
                            </Link>
                          ) : (
                            <span className="text-ink">{i.label}</span>
                          )}
                          {i.detail ? <span className="ml-2 text-[12px]">{i.detail}</span> : null}
                          {i.kind === "NOT_IN_BOOKS" || i.kind === "PAYMENT_NOT_IN_BOOKS" || i.kind === "CANCEL_NOT_IN_BOOKS" ? (
                            <Badge tone="warning" className="ml-2">
                              Saving to books
                            </Badge>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{i.date ?? ""}</td>
                        <td colSpan={2} />
                        <td className="num py-1.5 pr-3 text-right">{formatINR(i.amountPaise)}</td>
                        <td />
                      </tr>
                    ))}
                    {p.unexplainedPaise !== 0 ? (
                      <tr className="border-b border-line/50">
                        <td className="py-1.5 pr-3 pl-4 text-danger" colSpan={4} title="Not found in our records: an invoice or bill older than 1 April of last financial year, or something entered directly in the books. Check the party's statement.">
                          {UNEXPLAINED}
                        </td>
                        <td className="num py-1.5 pr-3 text-right text-danger">{formatINR(p.unexplainedPaise)}</td>
                        <td />
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[12px] text-ink-faint">
            Balances are the books'. Under each party: the invoices and bills still open (ours, dated from 1 April of last financial year; a bill's due shows as “−”, we owe it), then everything else that makes up the balance — opening balance, money received or
            paid without choosing an invoice or bill, corrections, money moved between parties, payments kept as credit after a cancellation, and anything still being saved to the books. “+” adds to what they owe us; “−” to what we owe them.
          </p>
        </>
      ) : null}
    </div>
  );
}
