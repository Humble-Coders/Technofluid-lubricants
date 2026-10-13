import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole, Mail, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import wordmark from "@/assets/logo-wordmark.png";
import mark from "@/assets/logo-mark.png";
import { Button, Field, Input } from "@/components/ui";
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
    <div className="flex h-full">
      {/* Brand panel */}
      <aside className="app-drag relative hidden w-[42%] max-w-[560px] flex-col justify-between overflow-hidden bg-brand-charcoal p-10 text-white md:flex">
        <img src={mark} alt="" aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-[420px] opacity-[0.08]" />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: "linear-gradient(90deg, #E5342B, #F26F21 55%, #F4C9A0)" }}
        />
        <div className="mt-8 flex items-center gap-3">
          <img src={mark} alt="" aria-hidden className="size-9" />
          <span className="text-[15px] font-semibold tracking-wide">Technofluid Office</span>
        </div>
        <div className="max-w-sm">
          <h1 className="text-[26px] leading-tight font-semibold">Stock, sales and accounts — in one place.</h1>
          <p className="mt-3 text-[13px] leading-relaxed text-white/65">
            Every sale updates stock and the books together. Works even when the internet drops, and catches up on its own.
          </p>
        </div>
        <p className="text-2xs text-white/40">Technofluid Lubricants · Built by Humble Solutions</p>
      </aside>

      {/* Form */}
      <main className="relative flex flex-1 flex-col">
        <div className="app-drag h-11 shrink-0" />
        <div className="flex flex-1 items-center justify-center px-8 pb-16">
          <div className="w-full max-w-[360px]">
            <img src={wordmark} alt="Technofluid" className="mb-8 h-10 w-auto" />
            <h2 className="text-[20px] font-semibold text-ink">Sign in</h2>
            <p className="mt-1 text-[13px] text-ink-muted">Use the email and password your admin gave you.</p>

            <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
              <Field label="Email" htmlFor="email" error={errors.email?.message}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  leading={<Mail className="size-3.5" />}
                  invalid={!!errors.email}
                  {...register("email")}
                />
              </Field>
              <Field label="Password" htmlFor="password" error={errors.password?.message}>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  leading={<LockKeyhole className="size-3.5" />}
                  invalid={!!errors.password}
                  {...register("password")}
                />
              </Field>

              {error ? (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-[12px] text-danger">
                  <ShieldAlert className="mt-px size-3.5 shrink-0" />
                  {error}
                </div>
              ) : null}

              <Button type="submit" variant="primary" loading={isSubmitting} className="mt-1 h-9">
                Sign in
              </Button>
            </form>

            {usingEmulators ? (
              <p className="mt-6 rounded-md bg-info-soft px-3 py-2 text-[12px] text-info">
                Development mode — using test data on this computer, not the live Technofluid data.
              </p>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
