import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AGE_BUCKET_LABEL, AGE_BUCKETS, formatINR, type AgeBucket, type MoneyOwedReport } from "@technofluid/core";
import { Badge, EmptyState, IconButton, SearchInput, Segmented, SidePanel, Table, Td, Th, Tr } from "@/components/ui";

export type OpenListKind = "invoices" | "bills" | "ledger";

const TITLE: Record<OpenListKind, string> = {
  invoices: "Open invoices",
  bills: "Open bills",
  ledger: "Open ledger",
};
const SUBTITLE: Record<OpenListKind, string> = {
  invoices: "Every invoice not fully paid yet, owed to us",
  bills: "Every supplier's bill we haven't fully paid yet",
  ledger: "Money on a party's account that isn't against an open invoice or bill. + owed to us · − their advance or credit, or we owe",
};

/** One line of the panel, whatever the list. */
interface Line {
  key: string;
  party: string;
  date: string | null;
  /** Invoice / bill number, or what the ledger piece is. */
  what: string;
  detail: string | null;
  link: string | null;
  totalPaise: number | null;
  paidPaise: number | null;
  /** Signed for the ledger; positive due for invoices and bills. */
  amountPaise: number;
  ageDays: number | null;
  bucket: AgeBucket;
}

type Filter = "all" | AgeBucket;

/**
 * Reports → Money owed → click a row (or an amount) of "Still due, by age": every open
 * invoice, open bill or open-ledger piece across all parties, oldest first, with a search
 * and the age brackets to narrow it down.
 */
export function OpenListPanel({ report, kind, bucket, onClose }: { report: MoneyOwedReport; kind: OpenListKind; bucket: AgeBucket | null; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>(bucket ?? "all");
  const [search, setSearch] = useState("");
  useEffect(() => setFilter(bucket ?? "all"), [kind, bucket]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const lines = useMemo(() => {
    const parties = [...report.owedToUs, ...report.weOwe, ...report.settled];
    const out: Line[] = [];
    for (const p of parties) {
      if (kind === "ledger") {
        p.openLedger.forEach((l, n) =>
          out.push({
            key: `${p.entityId}:${n}`,
            party: p.name,
            date: l.date,
            what: l.label,
            detail: l.detail,
            link: l.document ? (l.document.kind === "INVOICE" ? `/sales/${l.document.id}` : `/purchases/${l.document.id}`) : null,
            totalPaise: null,
            paidPaise: null,
            amountPaise: l.amountPaise,
            ageDays: l.ageDays,
            bucket: l.bucket,
          }),
        );
      } else {
        for (const d of p.documents) {
          if ((kind === "invoices") !== (d.kind === "INVOICE")) continue;
          out.push({
            key: d.id,
            party: p.name,
            date: d.date,
            what: d.ref,
            detail: d.partyRef ? `their bill ${d.partyRef}` : null,
            link: d.kind === "INVOICE" ? `/sales/${d.id}` : `/purchases/${d.id}`,
            totalPaise: d.totalPaise,
            paidPaise: d.paidPaise,
            amountPaise: d.duePaise,
            ageDays: d.ageDays,
            bucket: d.bucket,
          });
        }
      }
    }
    // Oldest first; undated (the unexplained part) at the top, as the oldest.
    return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.party.localeCompare(b.party) || a.what.localeCompare(b.what, undefined, { numeric: true }));
  }, [report, kind]);

  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = lines.filter((l) => (filter === "all" || l.bucket === filter) && words.every((w) => `${l.party} ${l.what} ${l.detail ?? ""}`.toLowerCase().includes(w)));
  const total = shown.reduce((s, l) => s + l.amountPaise, 0);
  const docs = kind !== "ledger";
  const noun = docs ? (kind === "invoices" ? "invoice" : "bill") : "entry";
  const plural = docs ? `${noun}s` : "entries";

  return (
    <SidePanel size="lg" label={TITLE[kind]} onClose={onClose}>
      <div className="flex shrink-0 items-start gap-2 px-6 pt-6 pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold text-ink">{TITLE[kind]}</h2>
          <p className="mt-0.5 text-label text-ink-muted">{SUBTITLE[kind]}</p>
        </div>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[["all", `All (${lines.length})`] as [Filter, string], ...AGE_BUCKETS.map((b): [Filter, string] => [b, AGE_BUCKET_LABEL[b]])]}
        />
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder={docs ? `Party or ${noun} no.` : "Party or detail"} className="w-52" aria-label="Search" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        {shown.length === 0 ? (
          <EmptyState title={lines.length === 0 ? `No open ${plural}` : `No ${plural} match`}>{lines.length === 0 ? null : "Try another age or other words."}</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Party</Th>
                <Th>{docs ? (kind === "invoices" ? "Invoice" : "Bill") : "What"}</Th>
                <Th>Date</Th>
                {docs ? (
                  <>
                    <Th align="right">Total</Th>
                    <Th align="right">Paid</Th>
                  </>
                ) : null}
                <Th align="right">{docs ? "Due" : "Amount"}</Th>
                <Th align="right">Age</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <Tr key={l.key}>
                  <Td className="font-medium">{l.party}</Td>
                  <Td>
                    {l.link ? (
                      <Link to={l.link} onClick={onClose} className={docs ? "num font-medium text-ink underline-offset-2 hover:text-accent hover:underline" : "text-ink underline-offset-2 hover:text-accent hover:underline"}>
                        {l.what}
                      </Link>
                    ) : (
                      <span className={l.ageDays === null && !docs ? "text-danger" : "text-ink"}>{l.what}</span>
                    )}
                    {l.detail ? <div className="text-label text-ink-muted">{l.detail}</div> : null}
                  </Td>
                  <Td className="whitespace-nowrap">{l.date ?? "-"}</Td>
                  {docs ? (
                    <>
                      <Td num>{formatINR(l.totalPaise ?? 0)}</Td>
                      <Td num>{formatINR(l.paidPaise ?? 0)}</Td>
                    </>
                  ) : null}
                  <Td num className="font-medium whitespace-nowrap">
                    {formatINR(l.amountPaise)}
                  </Td>
                  <Td num className="whitespace-nowrap">
                    {l.ageDays === null ? (
                      <span className="text-ink-muted">older</span>
                    ) : l.bucket === "90+" || l.bucket === "61-90" ? (
                      <Badge tone={l.bucket === "90+" ? "danger" : "warning"}>{l.ageDays} days</Badge>
                    ) : (
                      <span className="text-ink-muted">{l.ageDays} days</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line px-6 py-4 text-body">
        <span className="text-ink-muted">
          {shown.length} {shown.length === 1 ? noun : plural}
          {filter !== "all" ? ` · ${AGE_BUCKET_LABEL[filter]}` : ""}
        </span>
        <span className="font-semibold text-ink">Total {formatINR(total)}</span>
      </div>
    </SidePanel>
  );
}
