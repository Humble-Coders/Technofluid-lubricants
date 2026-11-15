import clsx from "clsx";
import { FileDown, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatQuantity, type BaseUnit } from "@technofluid/core";
import { Button, Spinner } from "@/components/ui";
import type { ReportState } from "@/hooks/useReports";
import { saveCsv } from "@/services/reportService";

const time = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "Figures as of …", Refresh and Save as CSV — the same bar on every report. */
export function ReportBar({ asOf, loading, onRefresh, csv, children }: { asOf: Date | null; loading: boolean; onRefresh: () => void; csv: (() => { fileName: string; text: string }) | null; children?: ReactNode }) {
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <span className="flex-1" />
      {note ? <span className={clsx("text-[12px]", note.tone === "ok" ? "text-success" : "text-danger")}>{note.text}</span> : null}
      <span className="text-[12px] text-ink-muted">{asOf ? `Figures as of ${time(asOf)}` : loading ? "Reading…" : ""}</span>
      <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={onRefresh} disabled={loading}>
        Refresh
      </Button>
      <Button size="sm" icon={<FileDown className="size-3.5" />} onClick={() => void save()} loading={saving} disabled={!csv}>
        Save as CSV
      </Button>
    </div>
  );
}

export function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "warning" | "success"; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-2.5">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={clsx("num text-[18px] font-semibold", tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-ink")}>{value}</p>
      {hint ? <p className="text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

/** Loading spinner / error with Retry while a report isn't ready. */
export function NotReady({ state, onRetry }: { state: ReportState<unknown>; onRetry: () => void }) {
  if (state.status === "loading") return <Spinner />;
  if (state.status === "error")
    return (
      <div className="flex items-center gap-3 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
        <span>{state.message}</span>
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
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
