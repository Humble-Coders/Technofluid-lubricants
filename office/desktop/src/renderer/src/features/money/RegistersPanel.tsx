import { Archive, History, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { DEFAULT_REGISTERS, formatINR, indiaDate, rupeesToPaise, type RegisterKind } from "@technofluid/core";
import { Badge, Banner, Button, Dialog, IconButton, Input, MoneyInput, Select } from "@/components/ui";
import { ensureDefaultRegisters, saveRegister, setRegisterActive, setRegisterOpening, type RegisterRow } from "@/services/moneyService";

const isDefault = (id: string) => DEFAULT_REGISTERS.some((r) => r.id === id);

/**
 * Our cash boxes and bank accounts, each with its balance and a way to its history. Admin
 * also manages them here: add, rename, reorder, set the opening balance ONCE (it can't be
 * changed later), archive (not the defaults; only at ₹0). The kind is fixed once created.
 * Without `canManage` (Accounts) it is the list and the histories only.
 */
export function RegistersPanel({
  registers,
  balances,
  onClose,
  canManage = true,
}: {
  registers: RegisterRow[];
  balances: Record<string, number> | null;
  onClose: () => void;
  canManage?: boolean;
}) {
  const navigate = useNavigate();
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

  if (!canManage) {
    return (
      <Dialog title="Cash & bank accounts" onClose={onClose} size="md">
        <ul className="border-t border-line-row">
          {registers
            .filter((r) => !r.placeholder)
            .map((r) => (
              <li key={r.id} className="flex h-11 items-center gap-3 border-b border-line-row">
                <span className="w-10 shrink-0 text-label text-ink-muted">{r.kind === "CASH" ? "Cash" : "Bank"}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
                {!r.isActive ? <Badge>Archived</Badge> : null}
                <span className={balances && (balances[r.id] ?? 0) < 0 ? "num shrink-0 text-danger" : "num shrink-0 text-ink"}>{balances ? formatINR(balances[r.id] ?? 0) : "-"}</span>
                <Button size="sm" icon={<History />} onClick={() => navigate(`/payments/registers/${r.id}`)}>
                  History
                </Button>
              </li>
            ))}
        </ul>
      </Dialog>
    );
  }

  return (
    <Dialog title="Cash & bank accounts" onClose={onClose} busy={busy} size="lg">
      {missingDefaults ? (
        <Banner
          tone="warning"
          action={
            <Button size="sm" onClick={() => void run(ensureDefaultRegisters)}>
              Set them up
            </Button>
          }
        >
          "Cash in hand" and "Bank" aren't set up yet.
        </Banner>
      ) : null}
      <ul className="border-t border-line-row">
        {registers
          .filter((r) => !r.placeholder)
          .map((r) => (
            <RegisterRowEditor key={r.id} register={r} balance={balances?.[r.id] ?? null} busy={busy} run={run} onHistory={() => navigate(`/payments/registers/${r.id}`)} />
          ))}
      </ul>
      <div>
        <h3 className="mb-2 text-label font-medium text-ink">Add an account</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Current" className="min-w-56 flex-1" maxLength={60} aria-label="New account name" />
          <Select value={kind} onChange={(e) => setKind(e.target.value as RegisterKind)} aria-label="Kind" className="w-28">
            <option value="BANK">Bank</option>
            <option value="CASH">Cash</option>
          </Select>
          <Button
            icon={<Plus />}
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
        <p className="mt-2 text-caption text-ink-subtle">Cash or bank can't be changed after adding. Names "Cash", "Bank" and "Inventory" are kept for the defaults.</p>
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}

function RegisterRowEditor({
  register: r,
  balance,
  busy,
  run,
  onHistory,
}: {
  register: RegisterRow;
  balance: number | null;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onHistory: () => void;
}) {
  const [name, setName] = useState(r.name);
  const [order, setOrder] = useState(String(r.displayOrder));
  const [openAmount, setOpenAmount] = useState("");
  const [openAsOf, setOpenAsOf] = useState(indiaDate());
  const [reason, setReason] = useState("");
  const changed = name.trim() !== r.name || order !== String(r.displayOrder);
  return (
    <li className="space-y-2 border-b border-line-row py-3">
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-label text-ink-muted">{r.kind === "CASH" ? "Cash" : "Bank"}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className="min-w-40 flex-1" maxLength={60} />
        <Input value={order} onChange={(e) => setOrder(e.target.value)} aria-label="Order" className="w-14" inputMode="numeric" title="Order on the Money in & out screen" />
        <Button disabled={!changed || busy} onClick={() => void run(() => saveRegister({ registerId: r.id, name: name.trim(), displayOrder: Number(order) }))}>
          Save
        </Button>
        <span className="num w-28 shrink-0 text-right text-ink">{balance === null ? "-" : formatINR(balance)}</span>
        <IconButton label={`${r.name} history`} onClick={onHistory}>
          <History />
        </IconButton>
        {!r.isActive ? <Badge>Archived</Badge> : null}
      </div>
      {r.opening ? (
        <p className="pl-12 text-label text-ink-muted">
          Opening {formatINR(r.opening.amountPaise)} on {r.opening.asOf}
          {r.opening.posted ? "" : " (saving to books…)"}
        </p>
      ) : (
        <div className="flex items-center gap-2 pl-12">
          <span className="min-w-0 flex-1 text-label text-ink-muted">Opening balance (can't be changed later)</span>
          <MoneyInput value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} className="w-32" aria-label="Opening amount" />
          <Input type="date" value={openAsOf} max={indiaDate()} onChange={(e) => setOpenAsOf(e.target.value)} className="w-36" aria-label="As of" />
          <Button
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
        <div className="flex items-center gap-2 pl-12">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={r.isActive ? "Reason to archive" : "Reason to restore"} className="min-w-40 flex-1" aria-label="Reason" />
          <Button icon={<Archive />} disabled={!reason.trim() || busy} onClick={() => void run(() => setRegisterActive(r.id, !r.isActive, reason))}>
            {r.isActive ? "Archive" : "Restore"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
