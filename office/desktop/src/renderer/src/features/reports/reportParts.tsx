import { FileDown, RefreshCw } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatQuantity, type BaseUnit } from "@technofluid/core";
import { Banner, Button, ErrorState, LoadingState, StatTile } from "@/components/ui";
import type { ReportState } from "@/hooks/useReports";
import { saveCsv } from "@/services/reportService";

const time = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The actions area of the Reports page header: the open report puts its "Figures as of …", Refresh and Save as CSV there. */
export const ReportActionsSlot = createContext<HTMLElement | null>(null);

/** "Figures as of …", Refresh and Save as CSV — the same on every report — and the report's own filters (`children`) as its toolbar. */
export function ReportBar({ asOf, loading, onRefresh, csv, children }: { asOf: Date | null; loading: boolean; onRefresh: () => void; csv: (() => { fileName: string; text: string }) | null; children?: ReactNode }) {
  const slot = useContext(ReportActionsSlot);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const save = async () => {
    if (!csv) return;
    setSaving(true);
    setNote(null);
    try {
      const { fileName, text } = csv();
      if (await saveCsv(fileName, text)) setNote({ tone: "ok", text: "Saved." });
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };
  const actions = (
    <>
      {note?.tone === "ok" ? <span className="text-label text-success">{note.text}</span> : null}
      <span className="text-label text-ink-muted">{asOf ? `Figures as of ${time(asOf)}` : loading ? "Reading…" : ""}</span>
      <Button variant="ghost" icon={<RefreshCw />} onClick={onRefresh} disabled={loading}>
        Refresh
      </Button>
      <Button icon={<FileDown />} onClick={() => void save()} loading={saving} disabled={!csv}>
        {saving ? "Saving…" : "Save as CSV"}
      </Button>
    </>
  );
  return (
    <>
      {slot ? createPortal(actions, slot) : null}
      {children ? <div className="mb-6 flex flex-wrap items-center gap-2">{children}</div> : null}
      {note?.tone === "error" ? (
        <Banner tone="danger" className="mb-6">
          {note.text}
        </Banner>
      ) : null}
    </>
  );
}

export function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "warning" | "success"; hint?: string }) {
  return <StatTile label={label} value={value} tone={tone} hint={hint} />;
}

/** Loading / error with Try again while a report isn't ready. */
export function NotReady({ state, onRetry }: { state: ReportState<unknown>; onRetry: () => void }) {
  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState action={<Button onClick={onRetry}>Try again</Button>}>{state.message}</ErrorState>;
  return null;
}

/** "1,200 L · 50 kg" for a quantity that can mix units. */
export function quantities(q: Partial<Record<BaseUnit, number>>): string {
  return (["L", "kg", "piece"] as const)
    .filter((u) => q[u] !== undefined)
    .map((u) => formatQuantity(q[u]!, u))
    .join(" · ");
}

export const PER_UNIT: Record<BaseUnit, string> = { L: "/L", kg: "/kg", piece: "/piece" };

/** A date for a file name: "2026-11-15". */
export const fileDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
