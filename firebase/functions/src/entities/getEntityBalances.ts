import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {HL_MAX_PAGE, plainHlMessage} from "../ledger/hlClient";
import {balanceDirection, hlAmountToPaise} from "./entityModel";

/**
 * Every entity's balance, from Humble Ledger (the app never stores one): pages GET
 * /customers and maps by externalId (= entity id). Signed paise: + they owe us.
 * A failure is an error ("Books unreachable"), never an empty / ₹0 result (§9b.5).
 */
export const getEntityBalances = onCall({region: "us-central1", secrets: HL_SECRETS}, async (request) => {
  await requireRole(request, ["admin", "accounts"]);
  const hl = getHlClient();
  const balances: Record<string, {balancePaise: number; direction: string}> = {};
  try {
    for (let page = 1; page <= 200; page++) {
      const res = await hl.listCustomers({page, limit: HL_MAX_PAGE});
      for (const c of res.data) {
        if (!c.externalId) continue;
        const paise = hlAmountToPaise(String(c.balance ?? c.outstanding ?? "0"));
        balances[c.externalId] = {balancePaise: paise, direction: balanceDirection(paise)};
      }
      if (!res.hasMore) break;
    }
  } catch (e) {
    throw new HttpsError("unavailable", plainHlMessage(e));
  }
  return {balances, asOf: new Date().toISOString()};
});
