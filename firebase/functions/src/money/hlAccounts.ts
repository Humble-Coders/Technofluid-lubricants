import {HL_MAX_PAGE, HlError, type HlAccount, type HlAccountType, type HlClient} from "../ledger/hlClient";

/**
 * HL accounts are NOT idempotent by name (brief §9b.7): list → create → RE-LIST, and a
 * 409 means "it exists — find it". Account names we make are unique (they carry our doc
 * id), so a re-list always finds the one we meant.
 */
export async function findAccount(hl: HlClient, name: string, type: HlAccountType): Promise<HlAccount | null> {
  const want = name.trim().toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const res = await hl.listAccounts({type, search: name, page, limit: HL_MAX_PAGE});
    const hit = res.data.find((a) => a.name.trim().toLowerCase() === want);
    if (hit) return hit;
    if (!res.hasMore) return null;
  }
  return null;
}

export async function getOrCreateAccount(hl: HlClient, name: string, type: HlAccountType, isTaxAccount = false): Promise<HlAccount> {
  const existing = await findAccount(hl, name, type);
  if (existing) return existing;
  try {
    await hl.createAccount({name, type, isTaxAccount});
  } catch (e) {
    if (!(e instanceof HlError && e.code === "ACCOUNT_EXISTS")) throw e;
  }
  const made = await findAccount(hl, name, type);
  if (!made) throw new HlError(`Account "${name}" was created but can't be found`, 503, true);
  return made;
}

/** Remembers system accounts for one function run. */
export function accountCache(hl: HlClient) {
  const cache = new Map<string, Promise<HlAccount>>();
  return (name: string, type: HlAccountType, isTaxAccount = false) => {
    const key = `${type}:${name}`;
    if (!cache.has(key)) cache.set(key, getOrCreateAccount(hl, name, type, isTaxAccount));
    return cache.get(key)!;
  };
}

export const registerAccountName = (kind: "CASH" | "BANK", name: string, id: string) => `${kind === "CASH" ? "Cash" : "Bank"} · ${name} · ${id}`;
export const categoryAccountName = (name: string, id: string) => `Expense · ${name} · ${id}`;
