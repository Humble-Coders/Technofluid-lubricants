import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import wordmark from "@/assets/logo-wordmark.png";
import { Banner, Button, Card, Field, Input } from "@/components/ui";
import { usingEmulators } from "@/lib/firebase";
import { useSession } from "./session";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("That doesn't look like an email address"),
  password: z.string().min(1, "Enter your password"),
});
type FormValues = z.infer<typeof schema>;

export function SignInScreen() {
  const { signIn } = useSession();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    }
  });

  return (
    <div className="flex h-full flex-col">
      <div className="app-drag h-11 shrink-0" />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-4 overflow-y-auto px-6 pb-16">
        <Card className="w-full max-w-sm p-8 shadow-card">
          <img src={wordmark} alt="Technofluid" className="mb-6 h-8 w-auto" />
          <h1 className="text-page font-semibold text-ink">Sign in to Technofluid Office</h1>
          <p className="mt-1 text-label text-ink-muted">Use the email and password your admin gave you.</p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="username" autoFocus leading={<Mail />} invalid={!!errors.email} {...register("email")} />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password?.message}>
              <Input id="password" type="password" autoComplete="current-password" leading={<LockKeyhole />} invalid={!!errors.password} {...register("password")} />
            </Field>

            {error ? <Banner tone="danger">{error}</Banner> : null}

            <Button type="submit" variant="primary" loading={isSubmitting} className="mt-2">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {usingEmulators ? (
            <Banner tone="info" className="mt-6">
              Development mode: using test data on this computer, not the live Technofluid data.
            </Banner>
          ) : null}
        </Card>
        <p className="text-caption text-ink-subtle">Technofluid Lubricants · Built by Humble Solutions</p>
      </main>
    </div>
  );
}
