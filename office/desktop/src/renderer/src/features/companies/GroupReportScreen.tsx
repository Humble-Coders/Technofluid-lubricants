import { BarChart3, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { companyPeriod, companyPeriodIn, formatINR, indiaDate, prettyDay, yearStartOf } from "@technofluid/core";
import { Banner, Button, Checkbox, EmptyState, ErrorState, Field, Input, LoadingState, Page, PageHeader, Segmented, Table, Td, Th } from "@/components/ui";
import { useCompanies } from "@/hooks/useCompanies";
import { getGroupReport, type GroupReport, type GroupReportKind } from "@/services/companyService";

const TITLES: Record<string, string> = {
  income: "Income",
  expenses: "Expenses",
  expense: "Expenses",
  assets: "Assets",
  liabilities: "Liabilities",
  equity: "Equity",
  accounts: "Accounts",
  netProfit: "Net profit",
  netprofit: "Net profit",
};
/** "data.income" / "sections[0]" → a heading people read. */
const title = (key: string) => {
  const last = key.split(".").pop()?.replace(/\[\d+\]$/, "") ?? key;
  return TITLES[last] ?? last.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());
};

/**
 * Group report (Tally Group Company): P&L, balance sheet or trial balance over several
 * companies, a column per company and the group total. Accounts with the same name are
 * added together; money moved between the companies is not taken out (Tally doesn't either).
 */
export function GroupReportScreen() {
  const today = indiaDate();
  const companies = useCompanies();
  const rows = useMemo(() => (companies.status === "ready" ? companies.data.filter((c) => !c.accessLost && c.hlCompanyId) : []), [companies]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosen = picked ?? rows.filter((c) => !c.archived).slice(0, 20).map((c) => c.id);
  const [kind, setKind] = useState<GroupReportKind>("pnl");
  const [from, setFrom] = useState(yearStartOf(today));
  const [to, setTo] = useState(today);
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<GroupReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string, on: boolean) => setPicked(on ? [...chosen, id] : chosen.filter((x) => x !== id));
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await getGroupReport(kind === "pnl" ? { kind, companyIds: chosen, from, to } : { kind, companyIds: chosen, date }));
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const columns = report ? rows.filter((c) => Object.values(report.sections).some((s) => s.lines.some((l) => c.id in l.byCompany)) || chosen.includes(c.id)).filter((c) => chosen.includes(c.id)) : [];

  return (
    <Page>
      <PageHeader title="Group report" subtitle="Several companies side by side, with the group total" back={{ to: "/companies", label: "Companies" }} />

      {companies.status === "loading" ? (
        <LoadingState />
      ) : companies.status === "error" ? (
        <ErrorState>{companies.message}</ErrorState>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-[1fr_auto] gap-8">
            <div>
              <p className="mb-2 text-label font-medium text-ink">Companies ({chosen.length} of 2–20)</p>
              <div className="grid max-h-48 grid-cols-2 gap-x-6 gap-y-1.5 overflow-y-auto">
                {rows.map((c) => (
                  <Checkbox key={c.id} checked={chosen.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} label={`${c.name} · ${companyPeriodIn(c, rows)}${c.archived ? " · archived" : ""}`} />
                ))}
              </div>
            </div>
            <div className="w-72 space-y-3">
              <Segmented
                wide
                value={kind}
                onChange={(k) => (setKind(k), setReport(null))}
                options={[
                  ["pnl", "P&L"],
                  ["balance-sheet", "Balance sheet"],
                  ["trial-balance", "Trial balance"],
                ]}
              />
              {kind === "pnl" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="From" htmlFor="gr-from">
                    <Input id="gr-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label="To" htmlFor="gr-to">
                    <Input id="gr-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <Field label="As of" htmlFor="gr-date">
                  <Input id="gr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              )}
              <Button variant="primary" icon={<Play />} loading={busy} disabled={chosen.length < 2 || chosen.length > 20} onClick={() => void run()} className="w-full">
                Show report
              </Button>
            </div>
          </div>

          {kind !== "pnl" ? <Banner className="mb-4">A year and the year carried from it can't be in the same balance sheet or trial balance — that would count the same money twice.</Banner> : null}
          {error ? <Banner tone="danger" className="mb-4">{error}</Banner> : null}

          {!report ? (
            <EmptyState icon={<BarChart3 />} title="Pick companies and a report">
              Then press Show report.
            </EmptyState>
          ) : (
            <>
              <p className="mb-3 text-label text-ink-muted">{report.kind === "pnl" && report.from && report.to ? `${prettyDay(report.from)} – ${prettyDay(report.to)}` : report.date ? `As of ${prettyDay(report.date)}` : ""}</p>
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Account</Th>
                      {columns.map((c) => (
                        <Th key={c.id} align="right" title={companyPeriodIn(c, rows)}>
                          {c.name}
                          <span className="block text-caption font-normal text-ink-subtle">{companyPeriodIn(c, rows)}</span>
                        </Th>
                      ))}
                      <Th align="right">Group total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sections.map((s) => (
                      <SectionRows key={s.key} label={title(s.key)} lines={s.lines} columns={columns.map((c) => c.id)} />
                    ))}
                    {report.totals.map((t) => (
                      <tr key={t.key}>
                        <Td className="font-semibold">{title(t.key)}</Td>
                        {columns.map((c) => (
                          <Td key={c.id} num className="font-semibold">
                            {formatINR(t.byCompany[c.id] ?? 0)}
                          </Td>
                        ))}
                        <Td num className="font-semibold">
                          {formatINR(t.totalPaise)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}

function SectionRows({ label, lines, columns }: { label: string; lines: GroupReport["sections"][number]["lines"]; columns: string[] }) {
  const sum = (id: string) => lines.reduce((s, l) => s + (l.byCompany[id] ?? 0), 0);
  return (
    <>
      <tr>
        <Td className="pt-5 text-label font-semibold tracking-wide text-ink-muted uppercase" colSpan={columns.length + 2}>
          {label}
        </Td>
      </tr>
      {lines.map((l) => (
        <tr key={l.name}>
          <Td>{l.name}</Td>
          {columns.map((id) => (
            <Td key={id} num>
              {l.byCompany[id] ? formatINR(l.byCompany[id]) : <span className="text-ink-faint">—</span>}
            </Td>
          ))}
          <Td num>{formatINR(l.totalPaise)}</Td>
        </tr>
      ))}
      <tr>
        <Td className="font-medium">Total {label.toLowerCase()}</Td>
        {columns.map((id) => (
          <Td key={id} num className="font-medium">
            {formatINR(sum(id))}
          </Td>
        ))}
        <Td num className="font-medium">
          {formatINR(lines.reduce((s, l) => s + l.totalPaise, 0))}
        </Td>
      </tr>
    </>
  );
}
