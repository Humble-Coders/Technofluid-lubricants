import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Modal } from "@/features/entities/EntityDetail";
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
      <div role="status" className="fixed right-4 bottom-4 z-50 w-72 space-y-2 rounded-xl border border-line bg-surface p-4 shadow-pop">
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <Download className="size-4 text-brand-orange" /> Downloading the update{state.version ? ` (${state.version})` : ""}…
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-canvas" aria-label={`${state.percent}% downloaded`}>
          <div className="h-full rounded-full bg-brand-orange transition-[width]" style={{ width: `${Math.max(2, state.percent)}%` }} />
        </div>
        <p className="text-[12px] text-ink-muted">{state.percent}% — keep working, we'll tell you when it's ready.</p>
      </div>
    );

  if (state.kind === "available")
    return (
      <Modal title={`A new version of Technofluid Office is available (${state.version})`} onClose={hide} busy={false}>
        {state.notes ? (
          <div>
            <p className="mb-1 text-[12px] font-medium tracking-wide text-ink-muted uppercase">What's new</p>
            <p className="max-h-60 overflow-y-auto rounded-md bg-canvas px-3 py-2 text-[13px] whitespace-pre-line text-ink">{state.notes}</p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">Fixes and improvements.</p>
        )}
        <p className="text-[12px] text-ink-muted">It downloads in the background; you can keep working.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={hide}>
            Later
          </Button>
          <Button
            variant="primary"
            icon={<Download className="size-3.5" />}
            onClick={() => {
              setState({ kind: "downloading", version: state.version, percent: 0 });
              act("download");
            }}
          >
            Update now
          </Button>
        </div>
      </Modal>
    );

  if (state.kind === "downloaded")
    return (
      <Modal title={`Technofluid Office ${state.version} is ready`} onClose={hide} busy={false}>
        <p className="text-[13px] text-ink">Restart to finish updating. The app closes, installs the new version and opens again — you stay signed in.</p>
        <p className="text-[12px] text-ink-muted">Save anything you're typing first. Or keep working: it installs by itself when you close the app.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={hide}>
            When I close the app
          </Button>
          <Button variant="primary" onClick={() => act("install")}>
            Restart now
          </Button>
        </div>
      </Modal>
    );

  return (
    <Modal title="The update couldn't be downloaded" onClose={hide} busy={false}>
      <p className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{state.message}</p>
      <p className="text-[13px] text-ink-muted">You can download the new version from its page and run the installer by hand. Nothing you've saved is affected.</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={hide}>
          Close
        </Button>
        <Button variant="primary" onClick={() => act("openPage")}>
          Open download page
        </Button>
      </div>
    </Modal>
  );
}
