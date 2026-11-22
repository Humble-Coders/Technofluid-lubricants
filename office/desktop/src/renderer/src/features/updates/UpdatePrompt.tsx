import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Banner, Button, Dialog } from "@/components/ui";
import type { UpdateEvent } from "../../../../shared/ipc";

type State =
  | { kind: "hidden" }
  | { kind: "available"; version: string; notes: string | null }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

/**
 * The in-app update offer (Windows; main/updater.ts sends the news). A newer version is
 * offered with its release notes — Update now / Later, never forced. While it downloads, a
 * small card shows the progress and the person keeps working. Then: Restart now, or install
 * when the app is closed. A failed download offers the download page. "Later" / "Close" hide it
 * until the next start. Mounted once, above the sign-in screen and the app.
 */
export function UpdatePrompt() {
  const [state, setState] = useState<State>({ kind: "hidden" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.office?.onUpdate) return;
    return window.office.onUpdate((e: UpdateEvent) => {
      setState((s) => {
        if (e.kind === "available") return s.kind === "hidden" ? { kind: "available", version: e.version, notes: e.notes } : s;
        if (e.kind === "progress") return { kind: "downloading", version: s.kind === "available" || s.kind === "downloading" ? s.version : "", percent: e.percent };
        if (e.kind === "downloaded") return { kind: "downloaded", version: e.version };
        return { kind: "error", message: e.message };
      });
      // A download that finished or failed is always worth showing, even after "Later".
      if (e.kind === "downloaded" || e.kind === "error") setDismissed(false);
    });
  }, []);

  if (state.kind === "hidden" || dismissed) return null;
  const hide = () => setDismissed(true);
  const act = (action: "download" | "install" | "openPage") => void window.office?.update(action);

  if (state.kind === "downloading")
    return (
      <div role="status" className="fixed right-4 bottom-4 z-50 w-72 space-y-2 rounded-sheet border border-line bg-surface p-4 shadow-pop">
        <p className="flex items-center gap-2 text-label font-medium text-ink">
          <Download className="size-4 shrink-0 text-ink-subtle" aria-hidden /> Downloading the update{state.version ? ` (${state.version})` : ""}…
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt" aria-label={`${state.percent}% downloaded`}>
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(2, state.percent)}%` }} />
        </div>
        <p className="text-caption text-ink-muted">{state.percent}% — keep working, we'll tell you when it's ready.</p>
      </div>
    );

  if (state.kind === "available")
    return (
      <Dialog
        title="A new version is available"
        subtitle={`Technofluid Office ${state.version}`}
        size="md"
        onClose={hide}
        footer={
          <>
            <Button variant="ghost" onClick={hide}>
              Later
            </Button>
            <Button
              variant="primary"
              icon={<Download />}
              onClick={() => {
                setState({ kind: "downloading", version: state.version, percent: 0 });
                act("download");
              }}
            >
              Update now
            </Button>
          </>
        }
      >
        {state.notes ? (
          <div>
            <p className="mb-1.5 text-label font-medium text-ink-muted">What's new</p>
            <p className="selectable max-h-60 overflow-y-auto rounded-control bg-surface-alt px-3 py-2 text-body whitespace-pre-line text-ink">{state.notes}</p>
          </div>
        ) : (
          <p className="text-body text-ink-muted">Fixes and improvements.</p>
        )}
        <p className="text-label text-ink-muted">It downloads in the background; you can keep working.</p>
      </Dialog>
    );

  if (state.kind === "downloaded")
    return (
      <Dialog
        title={`Technofluid Office ${state.version} is ready`}
        onClose={hide}
        footer={
          <>
            <Button variant="ghost" onClick={hide}>
              When I close the app
            </Button>
            <Button variant="primary" onClick={() => act("install")}>
              Restart now
            </Button>
          </>
        }
      >
        <p className="text-body text-ink">Restart to finish updating. The app closes, installs the new version and opens again — you stay signed in.</p>
        <p className="text-label text-ink-muted">Save anything you're typing first. Or keep working: it installs by itself when you close the app.</p>
      </Dialog>
    );

  return (
    <Dialog
      title="The update couldn't be downloaded"
      onClose={hide}
      footer={
        <>
          <Button variant="ghost" onClick={hide}>
            Close
          </Button>
          <Button variant="primary" onClick={() => act("openPage")}>
            Open download page
          </Button>
        </>
      }
    >
      <Banner tone="danger">{state.message}</Banner>
      <p className="text-body text-ink-muted">You can download the new version from its page and run the installer by hand. Nothing you've saved is affected.</p>
    </Dialog>
  );
}
