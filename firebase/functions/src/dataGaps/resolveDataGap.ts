import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";

/**
 * "To fill in" (Technofluid Office, Sharnya 27 Nov 2026): Admin records a decision about
 * a gap in the product master that isn't a value — "not needed, leave it empty", the
 * answer to a question only Gaurav can answer, or keep/remove for an older product —
 * or undoes one. Values themselves (prices, HSN, units…) are saved through the usual
 * functions (editProduct, setProductsTax, saveStockItem); this never changes products,
 * stock or anything the website reads.
 *
 *  - Stored in dataGaps/{gapId}; Admin reads them (rules), only this function writes.
 *  - Removing an old product is only RECORDED here; Ansh removes it later (it changes
 *    the public catalog).
 *  - Each change is appended to `history`, so who decided what stays visible.
 *
 * Request: {gapId, action: "notNeeded" | "answer" | "keep" | "remove" | "reopen", value?, note?}
 */

export const DATA_GAPS = "dataGaps";

/** Same shapes as office/core dataGaps.ts. */
const GAP_ID = /^(price|hsn|density|unit|itemDensity|code|recipe|question|old):([^/\s]{1,150})$/;
const QUESTIONS = new Set(["blank-percent", "recipe-basis", "brake-fluid"]);
const ACTIONS = ["notNeeded", "answer", "keep", "remove", "reopen"] as const;
type Action = (typeof ACTIONS)[number];

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") bad(`${label} must be text.`);
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length > max) bad(`${label} must be ${max} characters or fewer.`);
  return t || null;
}

/** Which actions each kind of gap takes. */
function allowed(section: string): readonly Action[] {
  if (section === "question") return ["answer", "reopen"];
  if (section === "old") return ["keep", "remove", "reopen"];
  return ["notNeeded", "reopen"];
}

export const resolveDataGap = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const data = request.data ?? {};
  const gapId = typeof data.gapId === "string" ? data.gapId.trim() : "";
  const m = GAP_ID.exec(gapId);
  if (!m || m[2] === "." || m[2] === ".." || /^__.*__$/.test(m[2])) bad("Unknown item to fill in.");
  const section = m[1];
  if (section === "question" && !QUESTIONS.has(m[2])) bad("Unknown question.");
  const action = data.action as Action;
  if (!(ACTIONS as readonly string[]).includes(action) || !allowed(section).includes(action)) bad("That choice doesn't apply here.");
  const value = action === "answer" ? optionalText(data.value, "Answer", 500) : null;
  if (action === "answer" && !value) bad("Write the answer.");
  const note = optionalText(data.note, "Note", 300);

  const ref = admin.firestore().collection(DATA_GAPS).doc(gapId);
  const by = {uid: caller.uid, name: caller.name};
  await ref.set(
    {
      gapId,
      section,
      status: action === "reopen" ? "open" : "decided",
      action: action === "reopen" ? null : action,
      value,
      note,
      by,
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion({action, value, note, byName: caller.name, at: Timestamp.now()}),
    },
    {merge: true},
  );
  return {gapId, status: action === "reopen" ? "open" : "decided"};
});
