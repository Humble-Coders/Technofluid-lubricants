// File: frontend/app/(auth)/layout.tsx
import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col bg-page px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-textPrimary"
          >
            LubeFlow
          </Link>
          <p className="mt-2 text-sm text-textSecondary">
            Access your workspace account
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
