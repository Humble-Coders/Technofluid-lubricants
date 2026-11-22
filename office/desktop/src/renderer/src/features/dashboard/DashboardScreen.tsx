import { ArrowRight, Boxes, Package, ReceiptIndianRupee, Users } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Page, PageHeader, Section, StatTile, StatTiles } from "@/components/ui";
import { ROLE_LABEL, canOpen, canSeePrices, navFor } from "@/lib/access";
import { useStaff } from "@/features/auth/session";
import { useProducts } from "@/hooks/useProducts";
import { FinanceSections } from "./FinanceSections";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardScreen() {
  const { profile, role } = useStaff();
  const products = useProducts({ withPrices: canSeePrices(role) });
  const items = navFor(role);
  const seesMoney = canOpen(role, "/payments");

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
    <Page>
      <PageHeader title={`${greeting()}, ${profile.name.split(" ")[0]}`} subtitle={ROLE_LABEL[role]} />

      {/* Money first for Admin and Accounts; Stock & Production never sees money. */}
      {seesMoney ? <FinanceSections isAdmin={role === "admin"} /> : null}
      <Section title="Products">
      <StatTiles>
        <StatTile label="Products on sale" value={stats?.variants.toLocaleString("en-IN")} loading={!stats} hint="Grade × pack combinations" />
        <StatTile label="Stock pools" value={stats?.pools.toLocaleString("en-IN")} loading={!stats} hint="Product + grade; all packs share one" />
        {role !== "supervisor" ? (
          <StatTile
            label="Still need a price"
            value={stats?.unpriced.toLocaleString("en-IN")}
            loading={!stats}
            hint="Can't be billed until priced"
            tone={stats?.unpriced ? "warning" : undefined}
          />
        ) : null}
      </StatTiles>
      </Section>

      <Section title="Jump to">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {quick.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="group flex flex-col gap-2 rounded-sheet border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent/40 hover:bg-accent-50"
            >
              <q.icon className="size-5 text-accent" />
              <span className="flex items-center gap-1 text-body font-semibold text-ink">
                {q.label}
                <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="text-label text-ink-muted">{q.hint}</span>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
}
