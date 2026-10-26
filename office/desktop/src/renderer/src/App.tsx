import { createHashRouter, Outlet, RouterProvider, useLocation } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui";
import { canOpen } from "@/lib/access";
import { BlockedScreen } from "@/features/auth/BlockedScreen";
import { SessionProvider, useSession, useStaff } from "@/features/auth/session";
import { SignInScreen } from "@/features/auth/SignInScreen";
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { ComingNext, NoAccess } from "@/features/placeholder/ComingNext";
import { ProductsScreen } from "@/features/products/ProductsScreen";
import { StockScreen } from "@/features/stock/StockScreen";
import { ApprovalsScreen } from "@/features/approvals/ApprovalsScreen";
import { EntitiesScreen } from "@/features/entities/EntitiesScreen";
import { ExpensesScreen } from "@/features/money/ExpensesScreen";
import { MoneyScreen } from "@/features/money/MoneyScreen";
import { RegisterHistory } from "@/features/money/RegisterHistory";

/** Shows a screen only to roles allowed to open it (UX only — rules + Functions are the real gate). */
function Guarded() {
  const { role } = useStaff();
  const { pathname } = useLocation();
  return canOpen(role, pathname) ? <Outlet /> : <NoAccess />;
}

// Hash routing: the shipped app loads from a local file, where path routing can't work.
const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      {
        element: <Guarded />,
        children: [
          { index: true, element: <DashboardScreen /> },
          { path: "products", element: <ProductsScreen /> },
          { path: "sales", element: <ComingNext title="Sales & invoices" description="Pick a customer and products, GST is worked out, stock goes down and the sale is posted to the books." /> },
          { path: "customers", element: <EntitiesScreen /> },
          { path: "payments", element: <MoneyScreen /> },
          { path: "payments/registers/:registerId", element: <RegisterHistory /> },
          { path: "stock", element: <StockScreen /> },
          { path: "production", element: <ComingNext title="Production" description="Log a batch: stock of the finished product goes up, raw materials go down by the recipe." /> },
          { path: "purchases", element: <ComingNext title="Suppliers & purchases" description="Raw-material bills, payments to suppliers and what we owe." /> },
          { path: "expenses", element: <ExpensesScreen /> },
          { path: "reports", element: <ComingNext title="Reports" description="Profit & loss, balance sheet, sales and stock reports." /> },
          { path: "approvals", element: <ApprovalsScreen /> },
          { path: "settings", element: <ComingNext title="Settings" description="Staff logins and roles, company details, invoice settings." /> },
          { path: "*", element: <NoAccess /> },
        ],
      },
    ],
  },
]);

function Gate() {
  const { session } = useSession();
  switch (session.status) {
    case "loading":
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner className="size-5" />
        </div>
      );
    case "signedOut":
      return <SignInScreen />;
    case "blocked":
      return <BlockedScreen email={session.user.email} reason={session.reason} />;
    case "ready":
      return <RouterProvider router={router} />;
  }
}

export function App() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}
