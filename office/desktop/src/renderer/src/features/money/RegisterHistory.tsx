import clsx from "clsx";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { formatINR, indiaDate } from "@technofluid/core";
import { Button, Input, Select, Spinner } from "@/components/ui";
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
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 px-5 py-4">
        <Link to="/payments" className="inline-flex items-center gap-1 text-[12px] text-info hover:underline">
          <ArrowLeft className="size-3.5" /> Money in & out
        </Link>
        <h2 className="text-[16px] font-semibold text-ink">{register?.name ?? "Cash / bank account"}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" className="w-36" />
          <span className="text-ink-muted">–</span>
          <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" className="w-36" />
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Type" className="w-40">
            <option value="all">Everything</option>
            <option value="received">Received</option>
            <option value="paid">Paid</option>
            <option value="transfer">Transfers</option>
            <option value="expense">Expenses</option>
            <option value="correction">Corrections</option>
          </Select>
        </div>
        {state.status === "loading" ? (
          <Spinner />
        ) : state.status === "error" ? (
          <p className="flex items-center gap-2 text-[12px] text-warning">
            {state.message}
            <Button size="sm" onClick={retry} icon={<RefreshCw className="size-3.5" />}>
              Retry
            </Button>
          </p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              {[
                ["Money in", state.data.inPaise, "text-success"],
                ["Money out", state.data.outPaise, "text-danger"],
                ["Net", state.data.inPaise - state.data.outPaise, "text-ink"],
                [`Balance as at ${state.data.to}`, state.data.closingPaise, "text-ink"],
              ].map(([label, paise, cls]) => (
                <div key={String(label)} className="rounded-lg border border-line px-4 py-3">
                  <p className="text-[12px] text-ink-muted">{label}</p>
                  <p className={clsx("num text-[18px] font-semibold", cls)}>{formatINR(Number(paise))}</p>
                </div>
              ))}
            </div>
            <table className="w-full border-collapse text-[13px]">
              <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">With</th>
                  <th className="py-2 pr-3 text-right font-medium">In</th>
                  <th className="py-2 pr-3 text-right font-medium">Out</th>
                  <th className="py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line/70 text-ink-muted">
                  <td className="py-2 pr-3">{state.data.from}</td>
                  <td className="py-2 pr-3" colSpan={4}>
                    Brought forward
                  </td>
                  <td className="num py-2 text-right">{formatINR(state.data.openingPaise)}</td>
                </tr>
                {rows.map((r, i) => (
                  <tr key={`${r.entryId ?? r.kind}-${i}`} className="border-b border-line/70">
                    <td className="py-2 pr-3 whitespace-nowrap">{r.date}</td>
                    <td className="py-2 pr-3">{KIND[r.kind]}</td>
                    <td className="py-2 pr-3 text-ink-muted">
                      {r.counterpart ?? ""}
                      {r.note ? <span className="ml-1 text-2xs">· {r.note}</span> : null}
                    </td>
                    <td className="num py-2 pr-3 text-right text-success">{r.inPaise ? formatINR(r.inPaise) : ""}</td>
                    <td className="num py-2 pr-3 text-right text-danger">{r.outPaise ? formatINR(r.outPaise) : ""}</td>
                    <td className={clsx("num py-2 text-right font-medium", r.balancePaise < 0 ? "text-danger" : "text-ink")}>{formatINR(r.balancePaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state.data.hasMore ? <p className="text-[12px] text-ink-muted">More rows than shown — narrow the dates.</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
