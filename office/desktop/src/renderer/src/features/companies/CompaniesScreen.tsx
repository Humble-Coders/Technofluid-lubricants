import { Archive, BarChart3, Building2, CalendarPlus, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { MAIN_LINE, companyPeriod, companyPeriodIn, prettyDay } from "@technofluid/core";
import { Badge, Banner, Button, EmptyState, ErrorState, FilterPill, LoadingState, Menu, Page, PageHeader, SearchInput, Table, TableFooter, Td, Th, Tr } from "@/components/ui";
import { useCompanies } from "@/hooks/useCompanies";
import type { CompanyRow } from "@/services/companyService";
import { CompanyFormDialog, type CompanyFormMode } from "./CompanyFormDialog";
import { CompanyPanel } from "./CompanyPanel";

/** The latest company of the main business — what "New financial year" continues. */
export function latestMainCompany(rows: CompanyRow[]): CompanyRow | null {
  const main = rows.filter((c) => c.line === MAIN_LINE && !c.accessLost);
  return main.sort((a, b) => (b.lineFrom ?? "").localeCompare(a.lineFrom ?? ""))[0] ?? null;
}

/** "Main business" / "Main business from 1 Apr 2027" / "Money only". */
export function CompanyKindBadge({ company: c }: { company: CompanyRow }) {
  if (c.line !== MAIN_LINE) return <Badge>Money only</Badge>;
  return <Badge tone="brand">{c.lineFrom ? `Main business from ${prettyDay(c.lineFrom)}` : "Main business"}</Badge>;
}

/**
 * Companies (admin only): every set of books the app keeps in Humble Ledger — the main
 * business (one company per financial year, if the client wants that) and separate
 * money-only books for people in the business. Like Tally's company list: add a company,
 * start a new financial year, close a year, see each company's details, group reports.
 */
export function CompaniesScreen() {
  const navigate = useNavigate();
  const companies = useCompanies();
  const rows = useMemo(() => (companies.status === "ready" ? companies.data : []), [companies]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyFormMode | null>(null);

  const archivedCount = rows.filter((c) => c.archived).length;
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((c) => {
      if (c.archived && !showArchived) return false;
      const text = `${c.name} ${companyPeriodIn(c, rows)} ${c.details.mailingName ?? ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [rows, search, showArchived]);

  const open = rows.find((c) => c.id === openId) ?? null;
  const latest = latestMainCompany(rows);

  return (
    <Page>
      <PageHeader
        title="Companies"
        subtitle="Separate books in Humble Ledger. Only admin can add or open companies."
        actions={
          <>
            <Button variant="primary" icon={<CalendarPlus />} disabled={!latest} onClick={() => latest && setForm({ kind: "newYear", source: latest })}>
              New financial year
            </Button>
            <Button icon={<Plus />} onClick={() => setForm({ kind: "add" })}>
              Add company
            </Button>
            <Menu
              items={[
                { label: "Group report", icon: <BarChart3 />, onSelect: () => navigate("/companies/report"), disabled: rows.length < 2, hint: "Needs at least two companies" },
                { label: companies.refreshing ? "Refreshing…" : "Refresh from Humble Ledger", icon: <RefreshCw />, onSelect: () => void companies.refresh(), disabled: companies.refreshing },
              ]}
            />
          </>
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder="Company name or year" aria-label="Search" />
            {archivedCount ? (
              <FilterPill active={showArchived} onClick={() => setShowArchived((v) => !v)} icon={<Archive />}>
                Show archived ({archivedCount})
              </FilterPill>
            ) : null}
          </>
        }
      />

      {companies.refreshError ? (
        <Banner tone="warning" title="Couldn't read the company list from Humble Ledger" className="mb-4" action={<Button size="sm" onClick={() => void companies.refresh()}>Try again</Button>}>
          {companies.refreshError}
        </Banner>
      ) : null}

      {companies.status === "loading" ? (
        <LoadingState />
      ) : companies.status === "error" ? (
        <ErrorState>{companies.message}</ErrorState>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Building2 />} title={rows.length ? "No company matches" : "No companies yet"}>
          {rows.length ? "Try other words, or show archived companies." : "The main company appears here once the app can reach Humble Ledger."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>Period</Th>
                <Th>Books</Th>
                <Th>Closed up to</Th>
                <Th>Last entry</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <Tr key={c.id} onOpen={() => setOpenId(c.id)} selected={c.id === openId}>
                  <Td className="font-medium">
                    <span className={c.archived ? "text-ink-subtle" : undefined}>{c.name}</span>
                    {c.archived ? <Badge className="ml-2">Archived</Badge> : null}
                    {c.accessLost ? <Badge tone="danger" className="ml-2">No access</Badge> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">{companyPeriodIn(c, rows)}</Td>
                  <Td>
                    <CompanyKindBadge company={c} />
                  </Td>
                  <Td className="num whitespace-nowrap">{c.lockedThrough ? prettyDay(c.lockedThrough) : <span className="text-ink-subtle">Open</span>}</Td>
                  <Td className="num whitespace-nowrap text-ink-muted">{c.info?.lastEntryDate ? prettyDay(c.info.lastEntryDate) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <TableFooter shown={shown.length} total={rows.length} noun={rows.length === 1 ? "company" : "companies"} />
        </>
      )}

      {open ? <CompanyPanel company={open} companies={rows} onClose={() => setOpenId(null)} onNewYear={() => setForm({ kind: "newYear", source: open })} /> : null}
      {form ? <CompanyFormDialog mode={form} companies={rows} onClose={() => setForm(null)} onCreated={(id) => setOpenId(id)} /> : null}
    </Page>
  );
}
