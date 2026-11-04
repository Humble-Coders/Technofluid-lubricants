import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { canEditStock } from "@/lib/access";
import { useProducts } from "@/hooks/useProducts";
import { useStockItems } from "@/hooks/useStock";
import { ensureProductPools } from "@/services/stockService";
import { DailyJournal } from "./DailyJournal";
import { LiveStock } from "./LiveStock";
import { StockHistory } from "./StockHistory";

type Tab = "live" | "journal" | "history";

/**
 * Stock (step 3): Live stock · Daily journal · History. Admin and Stock & Production
 * record; Accounts looks. Quantities only — no money on any of these screens.
 */
export function StockScreen() {
  const { role } = useStaff();
  const canEdit = canEditStock(role);
  const [tab, setTab] = useState<Tab>("live");
  const items = useStockItems();
  const products = useProducts({ withPrices: false });
  const productList = useMemo(() => (products.status === "ready" ? products.data : []), [products]);
  const itemList = useMemo(() => (items.status === "ready" ? items.data : []), [items]);

  // Every product + grade needs a stock pool. Create missing ones (once per visit).
  const synced = useRef(false);
  useEffect(() => {
    if (!canEdit || synced.current || items.status !== "ready" || products.status !== "ready") return;
    const pools = new Set(items.data.filter((i) => i.productKey).map((i) => i.productKey));
    if (products.data.some((p) => p.productKey && !pools.has(p.productKey))) {
      synced.current = true;
      ensureProductPools().catch(() => {
        synced.current = false;
      });
    }
  }, [canEdit, items, products]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 bg-surface px-5 pt-3 pb-1">
        <Segmented
          wide
          value={tab}
          onChange={setTab}
          options={[
            ["live", "Live stock"],
            ["journal", "Daily journal"],
            ["history", "History"],
          ]}
        />
      </div>
      {tab === "live" ? (
        <LiveStock items={items} products={productList} canEdit={canEdit} />
      ) : tab === "journal" ? (
        <DailyJournal items={itemList} products={productList} canEdit={canEdit} />
      ) : (
        <StockHistory canEdit={canEdit} />
      )}
    </div>
  );
}
