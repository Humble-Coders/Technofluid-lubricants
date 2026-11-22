import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Banner, Button, Dialog, Spinner } from "@/components/ui";
import { importDistributorEntities, type ImportSummary } from "@/services/entityService";

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
    <Dialog
      title="Import website distributors"
      size="lg"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {done ? "Close" : "Cancel"}
          </Button>
          {!done && preview && preview.created.length > 0 ? (
            <Button
              variant="primary"
              loading={busy}
              icon={<Download />}
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
        </>
      }
    >
      {busy && !shown ? (
        <p role="status" className="flex items-center gap-2 text-body text-ink-muted">
          <Spinner /> Checking the website's distributors…
        </p>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {shown ? (
        <div className="space-y-4">
          <p className="font-medium text-ink">
            {done ? `Added ${done.created.length}.` : `Will add ${shown.created.length}. Nothing has been saved yet.`}
            {shown.skipped.length ? ` ${shown.skipped.length} skipped.` : ""}
          </p>
          {shown.created.length ? (
            <ul className="max-h-64 overflow-y-auto border-t border-line-row">
              {shown.created.map((c) => (
                <li key={c.distributorId} className="border-b border-line-row py-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate font-medium text-ink">{c.name}</span>
                    {c.stateFrom === "gstin" ? <span className="shrink-0 text-caption text-ink-subtle">State from GSTIN</span> : <Badge tone="warning">State needed</Badge>}
                  </div>
                  {c.notes.length ? <p className="mt-0.5 text-label text-ink-muted">{c.notes.join(" · ")}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {shown.skipped.length ? (
            <details className="text-label text-ink-muted">
              <summary className="cursor-default">Skipped ({shown.skipped.length})</summary>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                {shown.skipped.map((s) => (
                  <li key={s.distributorId}>
                    {s.name || s.distributorId}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="text-label text-ink-muted">
            Price lists start empty. Choose one for each before billing. Those marked "State needed" need a state too.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
