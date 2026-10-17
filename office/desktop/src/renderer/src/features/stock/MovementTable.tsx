import clsx from "clsx";
import { Pencil, Undo2 } from "lucide-react";
import { Fragment, useState } from "react";
import { formatQuantity } from "@technofluid/core";
import { Badge, Button, Spinner } from "@/components/ui";
import type { LoadState } from "@/hooks/useProducts";
import type { StockMovement } from "@/services/stockService";
import { UndoForm } from "./MovementList";
import { EDITABLE_TYPES, KIND_LABEL, signedQuantity, TYPE_LABEL } from "./stockFormat";

const businessDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const time = (m: StockMovement) =>
  m.createdAt ? m.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Saving…";

/**
 * Diary lines as a table (History tab, Daily journal). Undone lines stay, muted and
 * struck through — nothing is erased. Undo / Edit open an inline row underneath.
 */
export function MovementTable({
  state,
  canEdit,
  emptyText,
  showDate = true,
}: {
  state: LoadState<StockMovement[]>;
  canEdit: boolean;
  emptyText: string;
  /** Off when every line is for the same business date (Daily journal). */
  showDate?: boolean;
}) {
  const [open, setOpen] = useState<{ id: string; mode: "undo" | "edit" } | null>(null);

  if (state.status === "loading") return <div className="p-5"><Spinner /></div>;
  if (state.status === "error") return <p className="p-5 text-[12px] text-danger">Couldn't load the history: {state.message}</p>;
  if (state.data.length === 0) return <p className="p-5 text-[12px] text-ink-muted">{emptyText}</p>;

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead className="sticky top-0 z-10 bg-canvas">
        <tr className="border-b border-line text-center text-2xs font-medium tracking-wide text-ink-muted uppercase">
          {showDate ? <th className="px-3 py-2 pl-5 font-medium whitespace-nowrap">Date</th> : null}
          <th className={clsx("px-3 py-2 text-left font-medium", !showDate && "pl-5")}>Item</th>
          <th className="px-3 py-2 font-medium whitespace-nowrap">What happened</th>
          <th className="px-3 py-2 font-medium">Quantity</th>
          <th className="px-3 py-2 font-medium whitespace-nowrap">Balance after</th>
          <th className="px-3 py-2 font-medium">Reason</th>
          <th className="px-3 py-2 font-medium">By</th>
          {canEdit ? <th className="px-3 py-2 pr-5 font-medium">Actions</th> : null}
        </tr>
      </thead>
      <tbody>
        {state.data.map((m) => {
          const undone = Boolean(m.reversedById);
          const editable = canEdit && !undone && m.type !== "REVERSAL";
          const isOpen = open?.id === m.id;
          return (
            <Fragment key={m.id}>
              <tr className={clsx("border-b border-line/70 text-center align-top", undone ? "bg-canvas/60 text-ink-faint" : "bg-surface hover:bg-hover")}>
                {showDate ? <td className="px-3 py-2 pl-5 whitespace-nowrap">{businessDate(m.journalDate)}</td> : null}
                <td className={clsx("min-w-[200px] px-3 py-2 text-left", !showDate && "pl-5")}>
                  <span className={clsx("font-medium", undone ? "line-through" : "text-ink")}>{m.itemName}</span>
                  <span className="block text-2xs text-ink-faint">{KIND_LABEL[m.itemKind]}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap justify-center gap-1">
                    <Badge tone={m.type === "REVERSAL" ? "neutral" : m.type === "COUNT_ADJUSTMENT" ? "warning" : m.type.startsWith("PRODUCTION") ? "brand" : "info"}>
                      {TYPE_LABEL[m.type] ?? m.type}
                    </Badge>
                    {m.replacesId ? <Badge tone="brand">Edited</Badge> : null}
                    {undone ? <Badge tone="neutral">Undone</Badge> : null}
                  </span>
                </td>
                <td
                  className={clsx(
                    "num px-3 py-2 font-semibold whitespace-nowrap",
                    undone ? "line-through" : m.qtyMilli < 0 ? "text-danger" : "text-success",
                  )}
                >
                  {signedQuantity(m.qtyMilli, m.baseUnit)}
                </td>
                <td className={clsx("num px-3 py-2 whitespace-nowrap", m.onHandAfterMilli < 0 && !undone ? "text-danger" : null)}>
                  {formatQuantity(m.onHandAfterMilli, m.baseUnit)}
                  {m.countedMilli !== null ? (
                    <span className="block text-2xs text-ink-faint">counted {formatQuantity(m.countedMilli, m.baseUnit)}</span>
                  ) : null}
                </td>
                <td className="min-w-[180px] max-w-[320px] px-3 py-2">
                  <span className="line-clamp-2" title={m.note ?? undefined}>
                    {m.note ?? "—"}
                  </span>
                  {m.type === "PRODUCTION_CONSUME" && m.producedItemName ? (
                    <span className="block text-2xs text-ink-faint">for {m.producedItemName}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {m.byName}
                  <span className="block text-2xs text-ink-faint">{time(m)}</span>
                </td>
                {canEdit ? (
                  <td className="px-3 py-1.5 pr-5 whitespace-nowrap">
                    {editable && !isOpen ? (
                      <span className="inline-flex gap-1.5">
                        {EDITABLE_TYPES.includes(m.type) ? (
                          <Button size="sm" onClick={() => setOpen({ id: m.id, mode: "edit" })} icon={<Pencil className="size-3" />}>
                            Edit
                          </Button>
                        ) : null}
                        <Button size="sm" onClick={() => setOpen({ id: m.id, mode: "undo" })} icon={<Undo2 className="size-3" />}>
                          Undo
                        </Button>
                      </span>
                    ) : (
                      <span className="text-2xs text-ink-faint">{undone ? "Undone" : m.type === "REVERSAL" ? "—" : ""}</span>
                    )}
                  </td>
                ) : null}
              </tr>
              {isOpen ? (
                <tr className="border-b border-line bg-canvas">
                  <td colSpan={(showDate ? 8 : 7) - (canEdit ? 0 : 1)} className="px-5 pb-3">
                    <UndoForm m={m} edit={open.mode === "edit"} onDone={() => setOpen(null)} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
