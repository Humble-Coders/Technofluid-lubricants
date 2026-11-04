import { Archive, Plus } from "lucide-react";
import { useState } from "react";
import { DEFAULT_REGISTERS, formatINR, indiaDate, rupeesToPaise, type RegisterKind } from "@technofluid/core";
import { Badge, Button, Input, Select } from "@/components/ui";
import { Modal } from "@/features/entities/EntityDetail";
import { ensureDefaultRegisters, saveRegister, setRegisterActive, setRegisterOpening, type RegisterRow } from "@/services/moneyService";

const isDefault = (id: string) => DEFAULT_REGISTERS.some((r) => r.id === id);

/**
 * Admin: our cash boxes and bank accounts. Add, rename, reorder, set the opening balance
 * ONCE (it can't be changed later), archive (not the defaults; only at ₹0). The kind is
 * fixed once created.
 */
export function RegistersPanel({ registers, balances, onClose }: { registers: RegisterRow[]; balances: Record<string, number> | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RegisterKind>("BANK");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missingDefaults = registers.some((r) => r.placeholder);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Cash & bank accounts" onClose={onClose} busy={busy} wide>
      {missingDefaults ? (
        <div className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
          <span className="flex-1">"Cash in hand" and "Bank" aren't set up yet.</span>
          <Button size="sm" onClick={() => void run(ensureDefaultRegisters)}>
            Set them up
          </Button>
        </div>
      ) : null}
      <ul className="space-y-2">
        {registers
          .filter((r) => !r.placeholder)
          .map((r) => (
            <RegisterRowEditor key={r.id} register={r} balance={balances?.[r.id] ?? null} busy={busy} run={run} />
          ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New account, e.g. HDFC Current" className="min-w-56 flex-1" maxLength={60} aria-label="New account name" />
        <Select value={kind} onChange={(e) => setKind(e.target.value as RegisterKind)} aria-label="Kind" className="w-32">
          <option value="BANK">Bank</option>
          <option value="CASH">Cash</option>
        </Select>
        <Button
          icon={<Plus className="size-3.5" />}
          disabled={!name.trim()}
          onClick={() =>
            void run(async () => {
              await saveRegister({ name: name.trim(), kind, displayOrder: registers.length + 1 });
              setName("");
            })
          }
        >
          Add
        </Button>
      </div>
      <p className="text-[12px] text-ink-muted">Cash or bank can't be changed after adding. Names "Cash", "Bank" and "Inventory" are kept for the defaults.</p>
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
    </Modal>
  );
}

function RegisterRowEditor({ register: r, balance, busy, run }: { register: RegisterRow; balance: number | null; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [name, setName] = useState(r.name);
  const [order, setOrder] = useState(String(r.displayOrder));
  const [openAmount, setOpenAmount] = useState("");
  const [openAsOf, setOpenAsOf] = useState(indiaDate());
  const [reason, setReason] = useState("");
  const changed = name.trim() !== r.name || order !== String(r.displayOrder);
  return (
    <li className="space-y-2 rounded-md bg-canvas px-3 py-2.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={r.kind === "CASH" ? "info" : "brand"}>{r.kind === "CASH" ? "Cash" : "Bank"}</Badge>
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className="min-w-48 flex-1" maxLength={60} />
        <Input value={order} onChange={(e) => setOrder(e.target.value)} aria-label="Order" className="w-16" inputMode="numeric" title="Order on the cards" />
        <Button size="sm" disabled={!changed || busy} onClick={() => void run(() => saveRegister({ registerId: r.id, name: name.trim(), displayOrder: Number(order) }))}>
          Save
        </Button>
        <span className="num w-28 text-right text-ink-muted">{balance === null ? "—" : formatINR(balance)}</span>
        {!r.isActive ? <Badge>Archived</Badge> : null}
      </div>
      {r.opening ? (
        <p className="text-[12px] text-ink-muted">
          Opening {formatINR(r.opening.amountPaise)} on {r.opening.asOf}
          {r.opening.posted ? "" : " — saving to books…"}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-ink-muted">Opening balance (can't be changed later):</span>
          <Input value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="₹" inputMode="decimal" className="num w-32" aria-label="Opening amount" />
          <Input type="date" value={openAsOf} max={indiaDate()} onChange={(e) => setOpenAsOf(e.target.value)} className="w-36" aria-label="As of" />
          <Button
            size="sm"
            disabled={!openAmount.trim() || busy}
            onClick={() =>
              void run(async () => {
                await setRegisterOpening(r.id, rupeesToPaise(openAmount), openAsOf);
              })
            }
          >
            Set opening
          </Button>
        </div>
      )}
      {!isDefault(r.id) ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={r.isActive ? "Reason to archive" : "Reason to restore"} className="min-w-48 flex-1" aria-label="Reason" />
          <Button size="sm" icon={<Archive className="size-3.5" />} disabled={!reason.trim() || busy} onClick={() => void run(() => setRegisterActive(r.id, !r.isActive, reason))}>
            {r.isActive ? "Archive" : "Restore"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
