import { ArrowRight, Boxes, Package, ReceiptIndianRupee, Users } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Card, Spinner } from "@/components/ui";
import { ROLE_LABEL, canSeePrices, navFor } from "@/lib/access";
import { useStaff } from "@/features/auth/session";
import { useProducts } from "@/hooks/useProducts";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardScreen() {
  const { profile, role } = useStaff();
  const products = useProducts({ withPrices: canSeePrices(role) });
  const items = navFor(role);

  const stats = useMemo(() => {
    if (products.status !== "ready") return null;
    const list = products.data;
    return {
      variants: list.length,
      pools: new Set(list.map((p) => p.productKey)).size,
      unpriced: list.filter((p) => p.dealerPricePaise === null).length,
    };
  }, [products]);

  const quick = [
    { to: "/sales", label: "New sale", icon: ReceiptIndianRupee, hint: "Bill a customer" },
    { to: "/customers", label: "Customers", icon: Users, hint: "Balances and statements" },
    { to: "/stock", label: "Stock", icon: Boxes, hint: "What's in the warehouse" },
    { to: "/products", label: "Products", icon: Package, hint: "Packs, prices, recipes" },
  ].filter((q) => items.some((i) => i.path === q.to));

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <p className="text-[12px] text-ink-muted">{ROLE_LABEL[role]}</p>
      <h2 className="mt-0.5 text-[22px] font-semibold">
        {greeting()}, {profile.name.split(" ")[0]}
      </h2>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Products on sale" value={stats?.variants} hint="grade × pack combinations" />
        <Stat label="Stock pools" value={stats?.pools} hint="product + grade, all packs share one" />
        {role !== "supervisor" ? (
          <Stat label="Still need a price" value={stats?.unpriced} hint="can't be billed until priced" tone="warning" />
        ) : null}
      </div>

      <h3 className="mt-8 mb-2 text-2xs font-medium tracking-wide text-ink-muted uppercase">Jump to</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {quick.map((q) => (
          <Link key={q.to} to={q.to} className="group">
            <Card className="flex h-full flex-col gap-2 p-4 transition-colors group-hover:border-brand-orange/40 group-hover:bg-brand-orange/[0.03]">
              <q.icon className="size-5 text-brand-orange" />
              <span className="flex items-center gap-1 text-[13px] font-semibold">
                {q.label}
                <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="text-[12px] text-ink-muted">{q.hint}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number | undefined; hint: string; tone?: "warning" }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={`num mt-1 text-[24px] font-semibold ${tone === "warning" && value ? "text-warning" : "text-ink"}`}>
        {value === undefined ? <Spinner /> : value.toLocaleString("en-IN")}
      </p>
      <p className="mt-0.5 text-2xs text-ink-faint">{hint}</p>
    </Card>
  );
}
