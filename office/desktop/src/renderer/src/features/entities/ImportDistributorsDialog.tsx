import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Spinner } from "@/components/ui";
import { importDistributorEntities, type ImportSummary } from "@/services/entityService";
import { Modal } from "./EntityDetail";

/**
 * Admin: make a customer for every approved website distributor that doesn't have one.
 * Shows the dry run first (nothing written), then imports on confirm. Reads the website's
 * distributors only — nothing on the website changes.
 */
export function ImportDistributorsDialog({ onClose }: { onClose: () => void }) {
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [done, setDone] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    importDistributorEntities(true)
      .then(setPreview)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, []);

  const shown = done ?? preview;
  return (
    <Modal title="Import website distributors" onClose={onClose} busy={busy} wide>
      {busy && !shown ? <Spinner /> : null}
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      {shown ? (
        <div className="space-y-3 text-[13px]">
          <p className="font-medium text-ink">
            {done ? `Added ${done.created.length}.` : `Will add ${shown.created.length} — nothing has been saved yet.`}
            {shown.skipped.length ? ` ${shown.skipped.length} skipped.` : ""}
          </p>
          {shown.created.length ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {shown.created.map((c) => (
                <li key={c.distributorId} className="rounded bg-canvas px-2.5 py-1.5">
                  <span className="font-medium text-ink">{c.name}</span>{" "}
                  {c.stateFrom === "gstin" ? <Badge tone="success">State from GSTIN</Badge> : <Badge tone="warning">State needed</Badge>}
                  {c.notes.length ? <p className="text-[12px] text-ink-muted">{c.notes.join(" · ")}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {shown.skipped.length ? (
            <details className="text-[12px] text-ink-muted">
              <summary className="cursor-default">Skipped ({shown.skipped.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {shown.skipped.map((s) => (
                  <li key={s.distributorId}>
                    {s.name || s.distributorId}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="text-[12px] text-ink-muted">
            Price lists start empty — choose one for each before billing. Those marked "State needed" need a state too.
          </p>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {done ? "Close" : "Cancel"}
        </Button>
        {!done && preview && preview.created.length > 0 ? (
          <Button
            variant="primary"
            loading={busy}
            icon={<Download className="size-3.5" />}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setDone(await importDistributorEntities(false));
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Import {preview.created.length}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
