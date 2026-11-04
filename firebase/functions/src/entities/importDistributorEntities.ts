import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {actorOf} from "./common";
import {ENTITIES, checkEntityInput, checkGstin, normalizePhone} from "./entityModel";

/**
 * Admin: make a customer for every approved, active website distributor that doesn't
 * have one yet (brief §4). Reads `distributors` only — nothing on the website changes.
 *
 *  - kinds customer; name, phone, email copied; the website's `gstNumber` becomes the
 *    GSTIN (if it's a valid one) and gives the state; the free-text address goes to line 1.
 *  - No GSTIN → the state is left empty and flagged "state needed" for Accounts.
 *  - priceTier stays empty ("choose a price list") — Sales won't bill until it's set.
 *  - {dryRun: true} shows exactly what would happen and writes nothing. Re-running skips
 *    distributors that already have a customer.
 */

interface Planned {
  distributorId: string;
  name: string;
  stateFrom: "gstin" | "needed";
  notes: string[];
  doc: Record<string, unknown>;
}

export const importDistributorEntities = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const dryRun = request.data?.dryRun !== false;
  const db = admin.firestore();
  const by = actorOf(caller);

  const [dists, linked, withGstin] = await Promise.all([
    db.collection("distributors").where("status", "==", "approved").get(),
    db.collection(ENTITIES).where("distributorId", "!=", null).get(),
    db.collection(ENTITIES).where("gstin", "!=", null).get(),
  ]);
  const taken = new Set(linked.docs.filter((d) => d.data().deleted !== true).map((d) => String(d.data().distributorId)));
  const gstinOwner = new Map(
    withGstin.docs.filter((d) => d.data().deleted !== true && d.data().isActive !== false).map((d) => [String(d.data().gstin), String(d.data().name)]),
  );

  const planned: Planned[] = [];
  const skipped: {distributorId: string; name: string; reason: string}[] = [];
  for (const doc of dists.docs) {
    const d = doc.data();
    const name = String(d.name ?? "").trim();
    if (d.isActive !== true || d.deleted === true) {
      skipped.push({distributorId: doc.id, name, reason: "Not active on the website"});
      continue;
    }
    if (taken.has(doc.id)) {
      skipped.push({distributorId: doc.id, name, reason: "Already has a customer"});
      continue;
    }
    const notes: string[] = [];
    const phone = typeof d.phone === "string" ? normalizePhone(d.phone) : null;
    if (d.phone && !phone) notes.push(`Phone "${d.phone}" left out (not a 10-digit number)`);
    let gstin: string | null = null;
    if (typeof d.gstNumber === "string" && d.gstNumber.trim()) {
      const c = checkGstin(d.gstNumber);
      if (c.valid) gstin = c.gstin;
      else notes.push(`GSTIN "${d.gstNumber}" left out (${c.reason})`);
    }
    if (gstin && gstinOwner.has(gstin)) {
      skipped.push({distributorId: doc.id, name, reason: `GSTIN ${gstin} is already used by ${gstinOwner.get(gstin)}`});
      continue;
    }
    const email = typeof d.email === "string" && d.email.trim() ? d.email.trim() : null;
    const inputFor = (withEmail: string | null) => ({
      name,
      kinds: ["customer"],
      phones: phone ? [phone] : [],
      email: withEmail,
      gstin,
      address: {line1: typeof d.address === "string" ? d.address.slice(0, 300) : "", stateCode: gstin ? gstin.slice(0, 2) : null},
      priceTier: null,
      creditLimitPaise: null,
      notes: null,
    });
    let check = checkEntityInput(inputFor(email), {allowMissingState: true});
    // A bad email shouldn't stop the import — drop it and say so.
    if (!check.ok && email && check.errors.every((e) => e.field === "email")) {
      notes.push(`Email "${email}" left out (doesn't look right)`);
      check = checkEntityInput(inputFor(null), {allowMissingState: true});
    }
    if (!check.ok) {
      skipped.push({distributorId: doc.id, name, reason: check.errors.map((e) => e.message).join(" ")});
      continue;
    }
    const v = check.value;
    const stateFrom = v.address.stateCode ? "gstin" : "needed";
    if (stateFrom === "needed") notes.push("State needed — no valid GSTIN to take it from");
    notes.push("Price list not chosen yet");
    planned.push({
      distributorId: doc.id,
      name: v.name,
      stateFrom,
      notes,
      doc: {
        ...v,
        nameLower: v.name.toLowerCase(),
        gstVerified: null,
        distributorId: doc.id,
        isWalkIn: false,
        isActive: true,
        deleted: false,
        opening: null,
        importNotes: notes,
        syncStatus: "PENDING",
        hlCustomerId: null,
        hlAccountId: null,
        hlSyncedAt: null,
        hlSyncError: null,
        syncAttempts: 0,
        createdBy: by,
        updatedBy: by,
      },
    });
    if (gstin) gstinOwner.set(gstin, v.name);
  }

  const created: {distributorId: string; entityId: string | null; name: string; stateFrom: string; notes: string[]}[] = [];
  if (!dryRun) {
    for (const p of planned) {
      // One transaction each: re-checks the distributor isn't linked meanwhile.
      const entityId = await db.runTransaction(async (tx) => {
        const again = await tx.get(db.collection(ENTITIES).where("distributorId", "==", p.distributorId));
        if (again.docs.some((x) => x.data().deleted !== true)) return null;
        const ref = db.collection(ENTITIES).doc();
        const now = FieldValue.serverTimestamp();
        tx.create(ref, {...p.doc, createdAt: now, updatedAt: now});
        tx.create(ref.collection("history").doc(), {at: now, by, action: "create", changes: {}, reason: "Imported from website distributors"});
        return ref.id;
      });
      if (entityId) created.push({distributorId: p.distributorId, entityId, name: p.name, stateFrom: p.stateFrom, notes: p.notes});
      else skipped.push({distributorId: p.distributorId, name: p.name, reason: "Already has a customer"});
    }
  }
  const rows = dryRun ? planned.map((p) => ({distributorId: p.distributorId, entityId: null, name: p.name, stateFrom: p.stateFrom, notes: p.notes})) : created;
  return {
    dryRun,
    created: rows,
    skipped,
    stateFromGstin: rows.filter((r) => r.stateFrom === "gstin").map((r) => r.name),
    stateNeeded: rows.filter((r) => r.stateFrom === "needed").map((r) => r.name),
  };
});
