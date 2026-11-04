import { UserX } from "lucide-react";
import { Button } from "@/components/ui";
import { useSession } from "./session";

export function BlockedScreen({ email, reason }: { email: string | null; reason: string }) {
  const { signOut } = useSession();
  return (
    <div className="flex h-full flex-col">
      <div className="app-drag h-11 shrink-0" />
      <div className="flex flex-1 items-center justify-center px-8 pb-16">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
            <UserX className="size-5" />
          </div>
          <h1 className="text-[18px] font-semibold">You can't use Technofluid Office with this account</h1>
          <p className="mt-2 text-[13px] text-ink-muted">{reason}</p>
          {email ? <p className="mt-4 text-[12px] text-ink-faint">Signed in as {email}</p> : null}
          <Button className="mt-6" onClick={() => void signOut()}>
            Sign in with a different account
          </Button>
        </div>
      </div>
    </div>
  );
}
