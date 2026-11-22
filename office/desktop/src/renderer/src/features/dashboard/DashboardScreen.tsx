import { ArrowRight, Boxes, Package, ReceiptIndianRupee, Users } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Page, PageHeader, Section, StatTile, StatTiles } from "@/components/ui";
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
    <Page>
      <PageHeader title={`${greeting()}, ${profile.name.split(" ")[0]}`} subtitle={ROLE_LABEL[role]} />

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

      <Section title="Jump to">
        <ul className="border-t border-line-row">
          {quick.map((q) => (
            <li key={q.to}>
              <Link to={q.to} className="group flex h-11 items-center gap-3 border-b border-line-row text-body text-ink hover:bg-surface-alt">
                <q.icon className="size-4 shrink-0 text-ink-subtle" />
                <span className="w-40 shrink-0 font-medium">{q.label}</span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">{q.hint}</span>
                <ArrowRight className="size-4 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}
