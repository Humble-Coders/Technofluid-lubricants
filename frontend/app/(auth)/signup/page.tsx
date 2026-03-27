"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/app/(auth)/_components/button";
import { Input } from "@/app/(auth)/_components/input";
import {
  signupSchema,
  type SignupFormInput,
} from "@/lib/validation/formSchemas";

import { auth } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

type UserRole = SignupFormInput["role"];

type SignupFormState = SignupFormInput;

type SignupErrors = Partial<Record<keyof SignupFormState, string>>;

const INITIAL_FORM: SignupFormState = {
  name: "",
  email: "",
  password: "",
  role: "salesperson",
};

export default function SignupPage() {
  const router = useRouter();

  const [form, setForm] = useState<SignupFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  const isSubmitDisabled = useMemo(
    () =>
      isLoading || !form.name || !form.email || !form.password || !form.role,
    [form, isLoading],
  );

  const updateField = (field: keyof SignupFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parseResult = signupSchema.safeParse(form);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      });
      return;
    }

    setIsLoading(true);

    try {
      // 🔥 STEP 1: Create Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        form.email,
        form.password,
      );

      const user = userCredential.user;

      // 🔥 STEP 2: Save user in Firestore (YOUR SCHEMA)
      await setDoc(doc(db, "users", user.uid), {
        email: form.email,
        name: form.name,
        phone: "",

        role: form.role === "distributor" ? "distributor" : "salesperson",
        status: "pending",
        isActive: true,

        distributorCount: 0,
        ordersCount: 0,

        createdBy: user.uid,
        approvedBy: null,
        approvedAt: null,
        lastLoginAt: null,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // If distributor role, also create in distributors collection
      if (form.role === "distributor") {
        await setDoc(doc(db, "distributors", user.uid), {
          email: form.email,
          name: form.name,
          phone: "",
          status: "pending",
          isActive: true,
          createdBy: user.uid,
          approvedBy: null,
          approvedAt: null,
          lastLoginAt: null,
          contactInfo: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      console.log("User created + saved in Firestore");

      router.push("/admin");
    } catch (error: any) {
      console.error(error.message);

      if (error.code === "auth/email-already-in-use") {
        setErrors({ email: "Email already in use" });
      } else if (error.code === "auth/weak-password") {
        setErrors({ password: "Password should be at least 6 characters" });
      } else {
        setErrors({ email: error.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8">
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-textPrimary">
          Create account
        </h1>
        <p className="text-sm text-textSecondary">
          Start managing lubricant operations today
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          id="name"
          name="name"
          type="text"
          label="Name"
          placeholder="Jane Doe"
          autoComplete="name"
          required
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          error={errors.name}
        />

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
          placeholder="Create a password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={(e) => updateField("password", e.target.value)}
          error={errors.password}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-textPrimary">
            Role
          </label>
          <select
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"
            value={form.role}
            onChange={(e) => updateField("role", e.target.value as UserRole)}
          >
            <option value="salesperson">Salesperson</option>
            <option value="distributor">Distributor</option>
          </select>
        </div>

        <Button type="submit" isLoading={isLoading} disabled={isSubmitDisabled}>
          Create Account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-textSecondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent">
          Login
        </Link>
      </p>
    </section>
  );
}
