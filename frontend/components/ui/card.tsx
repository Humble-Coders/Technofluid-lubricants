import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-border bg-surface p-5 shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-medium text-textSecondary">{children}</h3>;
}

export function CardValue({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-2xl font-semibold tracking-tight text-textPrimary">
      {children}
    </p>
  );
}
