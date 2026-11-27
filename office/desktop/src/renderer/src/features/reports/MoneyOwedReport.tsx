import clsx from "clsx";
import { Wallet } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router";
import { AGE_BUCKET_LABEL, AGE_BUCKETS, formatINR, paiseCsv, toCsv, type AgeBucket, type PartyOwed } from "@technofluid/core";
import { Badge, EmptyState, FilterPill, SearchInput, Segmented, StatTiles, Table, Td, Th, Tr } from "@/components/ui";
import { useMoneyOwedReport } from "@/hooks/useReports";
import { OpenListPanel, type OpenListKind } from "./OpenListPanel";
import { fileDay, NotReady, ReportBar, Stat } from "./reportParts";

type Side = "owedToUs" | "weOwe";

const OPEN_LEDGER_HELP =
  "Money on a party's account that isn't against an open invoice or bill: payments more or less than an invoice kept on account, advances, opening balances, corrections, money moved between parties and credit left by cancellations. Plus means they owe us; minus means they've paid ahead or we owe them.";

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
  const [drill, setDrill] = useState<{ kind: OpenListKind; bucket: AgeBucket | null } | null>(null);
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
            if (p.openLedgerPaise !== 0) rows.push([label, p.name, bal, "Open ledger (not against an invoice or bill)", null, null, null, null, paiseCsv(p.openLedgerPaise), null, null]);
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
    <>
      <ReportBar asOf={state.status === "ready" ? state.asOf : null} loading={state.status === "loading"} onRefresh={refresh} csv={csv} />
      <NotReady state={state} onRetry={refresh} />
      {r ? (
        <>
          <StatTiles>
            <Stat label="Owed to us" value={formatINR(r.owedToUsPaise)} hint={`${r.owedToUs.length} ${r.owedToUs.length === 1 ? "party" : "parties"} · from the books`} />
            <Stat label="We owe" value={formatINR(r.weOwePaise)} hint={`${r.weOwe.length} ${r.weOwe.length === 1 ? "party" : "parties"} · from the books`} />
          </StatTiles>

          <Table>
            <thead>
              <tr>
                <Th>Still due, by age</Th>
                {AGE_BUCKETS.map((b) => (
                  <Th key={b} align="right">
                    {AGE_BUCKET_LABEL[b]}
                  </Th>
                ))}
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["invoices", "Open invoices (owed to us)", r.invoiceAgeing, null],
                  ["bills", "Open bills (we owe)", r.billAgeing, null],
                  ["ledger", "Open ledger (not against an invoice or bill)", r.ledgerAgeing, OPEN_LEDGER_HELP],
                ] as const
              ).map(([kind, label, ageing, help]) => (
                <Tr key={kind} onOpen={() => setDrill({ kind, bucket: null })} selected={drill?.kind === kind} title="Click to see each one">
                  <Td title={help ?? undefined}>
                    <span className="underline-offset-2 hover:underline">{label}</span>
                    {help ? <div className="text-label text-ink-muted">+ owed to us · − advances and credit, or we owe</div> : null}
                  </Td>
                  {AGE_BUCKETS.map((b) => (
                    <Td key={b} num>
                      {ageing[b] ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDrill({ kind, bucket: b });
                          }}
                          title={`See the ones ${AGE_BUCKET_LABEL[b].toLowerCase()} old`}
                          className={clsx("rounded-[4px] px-1 underline-offset-2 hover:text-accent hover:underline", b === "90+" && ageing[b] > 0 && "font-medium text-danger")}
                        >
                          {formatINR(ageing[b])}
                        </button>
                      ) : (
                        "-"
                      )}
                    </Td>
                  ))}
                  <Td num className="font-medium">
                    {formatINR(AGE_BUCKETS.reduce((s, b) => s + ageing[b], 0))}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          <div className="mt-10 mb-2 flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder="Party, invoice or bill no." className="w-64" aria-label="Search" />
            <Segmented
              value={side}
              onChange={setSide}
              options={[
                ["owedToUs", `Owed to us (${r.owedToUs.length})`],
                ["weOwe", `We owe (${r.weOwe.length})`],
              ]}
            />
            <FilterPill active={showZero} onClick={() => setShowZero(!showZero)}>
              Show zero balances ({r.settled.length}
              {hiddenWithDocs ? `, ${hiddenWithDocs} with open documents` : ""})
            </FilterPill>
          </div>

          {parties.length === 0 ? (
            <EmptyState icon={<Wallet />} title={search ? "No party matches" : side === "owedToUs" ? "Nobody owes us anything" : "We don't owe anybody"}>
              {search ? "Try other words." : "Balances come from the books; turn on “Show zero balances” to see settled parties."}
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Party / document</Th>
                  <Th>Date</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Due</Th>
                  <Th align="right">Age</Th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p, at) => (
                  <Fragment key={p.entityId}>
                    <Tr>
                      <Td colSpan={4} className={clsx("font-semibold", at > 0 && "h-14 pt-5")}>
                        {p.name}
                      </Td>
                      <Td num colSpan={2} className={clsx("font-semibold whitespace-nowrap", at > 0 && "h-14 pt-5")}>
                        <span className={clsx(p.balancePaise !== null && p.balancePaise > 0 ? "text-ink" : p.balancePaise !== null && p.balancePaise < 0 ? "text-warning" : "text-ink-muted")}>{balanceText(p)}</span>
                      </Td>
                    </Tr>
                    {p.documents.map((d) => (
                      <Tr key={d.id}>
                        <Td>
                          <div className="pl-4">
                            <Link to={d.kind === "INVOICE" ? `/sales/${d.id}` : `/purchases/${d.id}`} className="num font-medium text-ink underline-offset-2 hover:text-accent hover:underline">
                              {d.ref}
                            </Link>
                            <span className="ml-2 text-label text-ink-muted">{d.kind === "INVOICE" ? "Invoice" : "Bill"}</span>
                            {d.partyRef ? <span className="ml-2 text-label text-ink-muted">their bill {d.partyRef}</span> : null}
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap">{d.date}</Td>
                        <Td num>{formatINR(d.totalPaise)}</Td>
                        <Td num>{formatINR(d.paidPaise)}</Td>
                        <Td num className="font-medium">
                          {d.kind === "BILL" ? `−${formatINR(d.duePaise)}` : formatINR(d.duePaise)}
                        </Td>
                        <Td num className="whitespace-nowrap">
                          {d.bucket === "90+" || d.bucket === "61-90" ? <Badge tone={d.bucket === "90+" ? "danger" : "warning"}>{d.ageDays} days</Badge> : <span className="text-ink-muted">{d.ageDays} days</span>}
                        </Td>
                      </Tr>
                    ))}
                    {p.openLedgerPaise !== 0 ? (
                      <Tr>
                        <Td colSpan={4} title={OPEN_LEDGER_HELP}>
                          <div className="pl-4 font-medium text-ink">
                            Open ledger
                            <span className="ml-2 text-label font-normal text-ink-muted">{p.openLedgerPaise > 0 ? "on account, owed to us" : "on account, their advance or credit"}</span>
                          </div>
                        </Td>
                        <Td num className="font-medium">
                          {formatINR(p.openLedgerPaise)}
                        </Td>
                        <Td />
                      </Tr>
                    ) : null}
                    {p.items.map((i, n) => (
                      <Tr key={`i${n}`}>
                        <Td muted>
                          <div className="pl-4">
                            {i.document ? (
                              <Link to={i.document.kind === "INVOICE" ? `/sales/${i.document.id}` : `/purchases/${i.document.id}`} className="text-ink underline-offset-2 hover:text-accent hover:underline">
                                {i.label}
                              </Link>
                            ) : (
                              <span className="text-ink">{i.label}</span>
                            )}
                            {i.detail ? <span className="ml-2 text-label">{i.detail}</span> : null}
                            {i.kind === "NOT_IN_BOOKS" || i.kind === "PAYMENT_NOT_IN_BOOKS" || i.kind === "CANCEL_NOT_IN_BOOKS" ? (
                              <Badge tone="warning" className="ml-2">
                                Saving to books
                              </Badge>
                            ) : null}
                          </div>
                        </Td>
                        <Td muted className="whitespace-nowrap">
                          {i.date ?? ""}
                        </Td>
                        <Td colSpan={2} />
                        <Td num muted>
                          {formatINR(i.amountPaise)}
                        </Td>
                        <Td />
                      </Tr>
                    ))}
                    {p.unexplainedPaise !== 0 ? (
                      <Tr>
                        <Td colSpan={4} title="Not found in our records: an invoice or bill older than 1 April of last financial year, or something entered directly in the books. Check the party's statement.">
                          <div className="pl-4 text-danger">{UNEXPLAINED}</div>
                        </Td>
                        <Td num>
                          <span className="text-danger">{formatINR(p.unexplainedPaise)}</span>
                        </Td>
                        <Td />
                      </Tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </Table>
          )}
          <p className="mt-4 max-w-4xl text-caption text-ink-subtle">
            Balances are the books'. Under each party: the invoices and bills still open (ours, dated from 1 April of last financial year; a bill's due shows as “−”, we owe it), then the open ledger: everything else that makes up the balance, not against any invoice or bill: opening balance, money received or
            paid without choosing an invoice or bill, corrections, money moved between parties, payments kept as credit after a cancellation, and anything still being saved to the books. “+” adds to what they owe us; “−” to what we owe them.
          </p>
          {drill ? <OpenListPanel report={r} kind={drill.kind} bucket={drill.bucket} onClose={() => setDrill(null)} /> : null}
        </>
      ) : null}
    </>
  );
}
