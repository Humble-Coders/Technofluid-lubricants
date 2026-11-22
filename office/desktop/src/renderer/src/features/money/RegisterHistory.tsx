import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { formatINR, indiaDate } from "@technofluid/core";
import { Banner, Button, ErrorState, FilterSelect, Input, LoadingState, Page, PageHeader, StatTile, Table, Td, Th, Tr } from "@/components/ui";
import { useRegisters, useRegisterStatement } from "@/hooks/useMoney";
import type { RegisterStatementRow } from "@/services/moneyService";

const KIND: Record<RegisterStatementRow["kind"], string> = {
  received: "Received",
  paid: "Paid",
  transfer: "Transfer",
  expense: "Expense",
  correction: "Correction",
  reversal: "Reversal",
  opening: "Opening balance",
  other: "Other",
};

/** One cash/bank account's history: money in, out, net, and the books' running balance. */
export function RegisterHistory() {
  const { registerId = "" } = useParams();
  const registers = useRegisters();
  const register = registers.status === "ready" ? registers.data.find((r) => r.id === registerId) : undefined;
  const today = indiaDate();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState<"all" | RegisterStatementRow["kind"]>("all");
  const { state, retry } = useRegisterStatement(registerId, from, to);
  const rows = useMemo(() => (state.status === "ready" ? state.data.rows.filter((r) => kind === "all" || r.kind === kind) : []), [state, kind]);

  return (
    <Page>
      <PageHeader
        back={{ to: "/payments", label: "Money in & out" }}
        title={register?.name ?? "Cash / bank account"}
        toolbar={
          <>
            <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" className="w-36" />
            <span className="text-ink-muted">–</span>
            <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" className="w-36" />
            <FilterSelect
              label="Type"
              value={kind}
              onChange={(v) => setKind(v as typeof kind)}
              options={[
                ["all", "Everything"],
                ["received", "Received"],
                ["paid", "Paid"],
                ["transfer", "Transfers"],
                ["expense", "Expenses"],
                ["correction", "Corrections"],
              ]}
            />
          </>
        }
      />
      {state.status === "loading" ? (
        <LoadingState />
      ) : state.status === "error" ? (
        <ErrorState
          action={
            <Button onClick={retry} icon={<RefreshCw />}>
              Retry
            </Button>
          }
        >
          {state.message}
        </ErrorState>
      ) : (
        <>
          {/* Wraps on a narrow window (StatTiles keeps every tile on one row). */}
          <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
            <StatTile label="Money in" value={formatINR(state.data.inPaise)} />
            <StatTile label="Money out" value={formatINR(state.data.outPaise)} />
            <StatTile label="Net" value={formatINR(state.data.inPaise - state.data.outPaise)} />
            <StatTile label={`Balance as at ${state.data.to}`} value={formatINR(state.data.closingPaise)} tone={state.data.closingPaise < 0 ? "danger" : undefined} />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>With</Th>
                <Th align="right">In</Th>
                <Th align="right">Out</Th>
                <Th align="right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              <Tr>
                <Td muted>{state.data.from}</Td>
                <Td muted colSpan={4}>
                  Brought forward
                </Td>
                <Td num muted>
                  {formatINR(state.data.openingPaise)}
                </Td>
              </Tr>
              {rows.map((r, i) => (
                <Tr key={`${r.entryId ?? r.kind}-${i}`}>
                  <Td className="whitespace-nowrap">{r.date}</Td>
                  <Td>{KIND[r.kind]}</Td>
                  <Td muted>
                    {r.counterpart ?? ""}
                    {r.note ? <span className="ml-1 text-caption">· {r.note}</span> : null}
                  </Td>
                  <Td num>{r.inPaise ? formatINR(r.inPaise) : ""}</Td>
                  <Td num>{r.outPaise ? formatINR(r.outPaise) : ""}</Td>
                  <Td num>
                    <span className={r.balancePaise < 0 ? "font-medium text-danger" : "font-medium"}>{formatINR(r.balancePaise)}</span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {state.data.hasMore ? (
            <Banner tone="warning" className="mt-4">
              There are more rows than shown. Narrow the dates.
            </Banner>
          ) : null}
        </>
      )}
    </Page>
  );
}
