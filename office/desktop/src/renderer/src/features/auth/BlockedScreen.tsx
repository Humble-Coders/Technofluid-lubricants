import wordmark from "@/assets/logo-wordmark.png";
import { Button, Card } from "@/components/ui";
import { useSession } from "./session";

export function BlockedScreen({ email, reason }: { email: string | null; reason: string }) {
  const { signOut } = useSession();
  return (
    <div className="flex h-full flex-col">
      <div className="app-drag h-11 shrink-0" />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-16">
        <Card className="flex w-full max-w-sm flex-col p-8 shadow-card">
          <img src={wordmark} alt="Technofluid" className="mb-6 h-8 w-auto self-start" />
          <h1 className="text-page font-semibold text-ink">You can't use Technofluid Office with this account</h1>
          <p className="mt-2 text-body text-ink-muted">{reason}</p>
          {email ? <p className="mt-4 text-label text-ink-subtle">Signed in as {email}</p> : null}
          <Button variant="primary" className="mt-6" onClick={() => void signOut()}>
            Sign in with a different account
          </Button>
        </Card>
      </main>
    </div>
  );
}
