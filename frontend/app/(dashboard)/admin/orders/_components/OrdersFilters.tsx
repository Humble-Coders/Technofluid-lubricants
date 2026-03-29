// File: frontend/app/(dashboard)/admin/orders/_components/OrdersFilters.tsx
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type OrdersFiltersProps = {
  searchQuery: string;
  statusFilter: string;
  dateRangeFilter: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onDateRangeChange: (value: string) => void;
};

export function OrdersFilters({
  searchQuery,
  statusFilter,
  dateRangeFilter,
  onSearchChange,
  onStatusChange,
  onDateRangeChange,
}: OrdersFiltersProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Input
        id="order-search"
        label="Search"
        placeholder="Search distributor or item"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      <Select
        id="order-status-filter"
        label="Status"
        options={[
          { label: "All", value: "all" },
          { label: "Pending", value: "pending" },
          { label: "Processing", value: "processing" },
          { label: "Approved", value: "approved" },
        ]}
        value={statusFilter}
        onChange={(event) => onStatusChange(event.target.value)}
      />

      <Select
        id="order-date-range"
        label="Date Range"
        options={[
          { label: "All time", value: "all" },
          { label: "Last 7 days", value: "7" },
          { label: "Last 30 days", value: "30" },
        ]}
        value={dateRangeFilter}
        onChange={(event) => onDateRangeChange(event.target.value)}
      />
    </div>
  );
}
