// File: frontend/app/(auth)/login/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/app/(auth)/_components/button";
import { Input } from "@/app/(auth)/_components/input";
import { loginSchema, type LoginFormInput } from "@/lib/validation/formSchemas";
import { ROLE_ROUTES } from "@/lib/constants";

import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

type LoginFormState = LoginFormInput;
type LoginErrors = Partial<Record<keyof LoginFormState, string>>;

const INITIAL_FORM: LoginFormState = {
  email: "",
  password: "",
};

export default function LoginPage() {
  const router = useRouter();

  const [form, setForm] = useState<LoginFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field: keyof LoginFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
    if (error) setError("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parseResult = loginSchema.safeParse(form);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      });
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // 🔥 STEP 1: Firebase login
      const userCredential = await signInWithEmailAndPassword(
        auth,
        form.email,
        form.password,
      );

      const user = userCredential.user;

      // 🔥 STEP 2: Fetch user from Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));

      if (!userDoc.exists()) {
        throw new Error("User data not found");
      }

      const userData = userDoc.data();

      // 🔥 STEP 3: Access Control
      if (!userData.isActive || userData.status !== "approved") {
        setError("Your account is not approved yet.");
        return;
      }

      // 🔥 STEP 4: Role-based routing
      const route = ROLE_ROUTES[userData.role] ?? "/dashboard";
      router.push(route);
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      console.error(code);

      if (
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found" ||
        code === "auth/wrong-password"
      ) {
        setError("Invalid email or password");
      } else if (code === "auth/user-disabled") {
        setError("This account has been disabled.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else if (code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8">
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-textPrimary">
          Welcome back
        </h1>
        <p className="text-sm text-textSecondary">
          Sign in to continue to your dashboard
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          placeholder="you@company.com"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => updateField("email", e.target.value)}
          error={errors.email}
        />

        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => updateField("password", e.target.value)}
          error={errors.password}
        />

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button
          type="submit"
          isLoading={isLoading}
          disabled={!form.email || !form.password}
        >
          Login
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-textSecondary">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-accent">
          Sign up
        </Link>
      </p>
    </section>
  );
}
