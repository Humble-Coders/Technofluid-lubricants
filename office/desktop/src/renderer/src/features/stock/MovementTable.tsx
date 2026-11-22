import clsx from "clsx";
import { Pencil, Undo2 } from "lucide-react";
import { Fragment, useState } from "react";
import { formatQuantity } from "@technofluid/core";
import { Badge, ErrorState, LoadingState, Menu, Table, Td, Th, Tr } from "@/components/ui";
import type { LoadState } from "@/hooks/useProducts";
import type { StockMovement } from "@/services/stockService";
import { UndoForm } from "./MovementList";
import { EDITABLE_TYPES, isDocumentLine, KIND_LABEL, signedQuantity, TYPE_LABEL } from "./stockFormat";

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

  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState title="Couldn't load the history">{state.message}</ErrorState>;
  if (state.data.length === 0) return <p className="py-3 text-label text-ink-muted">{emptyText}</p>;

  return (
    <Table>
      <thead>
        <tr>
          {showDate ? <Th>Date</Th> : null}
          <Th>Item</Th>
          <Th>What happened</Th>
          <Th align="right">Quantity</Th>
          <Th align="right">Balance after</Th>
          <Th>Reason</Th>
          <Th>By</Th>
          {canEdit ? (
            <Th className="w-8">
              <span className="sr-only">Actions</span>
            </Th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {state.data.map((m) => {
          const undone = Boolean(m.reversedById);
          const editable = canEdit && !undone && m.type !== "REVERSAL" && !isDocumentLine(m.type);
          const isOpen = open?.id === m.id;
          return (
            <Fragment key={m.id}>
              <Tr className={clsx(undone && "[&>td]:text-ink-subtle", isOpen && "[&>td]:border-b-transparent")}>
                {showDate ? <Td className="whitespace-nowrap">{businessDate(m.journalDate)}</Td> : null}
                <Td className="min-w-48">
                  <span className={clsx("font-medium", undone && "line-through")}>{m.itemName}</span>
                  <span className="block text-caption text-ink-subtle">{KIND_LABEL[m.itemKind]}</span>
                </Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="whitespace-nowrap">{TYPE_LABEL[m.type] ?? m.type}</span>
                    {m.replacesId ? <Badge tone="neutral">Edited</Badge> : null}
                    {undone ? <Badge tone="neutral">Undone</Badge> : null}
                  </span>
                </Td>
                <Td num className="whitespace-nowrap">
                  <span className={clsx("font-medium", undone && "line-through")}>{signedQuantity(m.qtyMilli, m.baseUnit)}</span>
                </Td>
                <Td num className="whitespace-nowrap">
                  <span className={m.onHandAfterMilli < 0 && !undone ? "text-danger" : undefined}>{formatQuantity(m.onHandAfterMilli, m.baseUnit)}</span>
                  {m.countedMilli !== null ? (
                    <span className="block text-caption text-ink-subtle">counted {formatQuantity(m.countedMilli, m.baseUnit)}</span>
                  ) : null}
                </Td>
                <Td className="max-w-80 min-w-44">
                  <span className="line-clamp-2" title={m.note ?? undefined}>
                    {m.note ?? "—"}
                  </span>
                  {m.type === "PRODUCTION_CONSUME" && m.producedItemName ? (
                    <span className="block text-caption text-ink-subtle">for {m.producedItemName}</span>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap">
                  {m.byName}
                  <span className="block text-caption text-ink-subtle">{time(m)}</span>
                </Td>
                {canEdit ? (
                  <Td align="right">
                    {editable && !isOpen ? (
                      <Menu
                        size="sm"
                        label="Line actions"
                        items={[
                          EDITABLE_TYPES.includes(m.type) ? { label: "Edit", icon: <Pencil />, onSelect: () => setOpen({ id: m.id, mode: "edit" }) } : null,
                          { label: "Undo", icon: <Undo2 />, onSelect: () => setOpen({ id: m.id, mode: "undo" }) },
                        ]}
                      />
                    ) : null}
                  </Td>
                ) : null}
              </Tr>
              {isOpen ? (
                <tr>
                  <Td colSpan={(showDate ? 8 : 7) - (canEdit ? 0 : 1)} className="pb-3">
                    <div className="px-0.5">
                      <UndoForm m={m} edit={open.mode === "edit"} onDone={() => setOpen(null)} />
                    </div>
                  </Td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}
