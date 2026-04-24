import { PriorityList } from "@/components/ui/PriorityList";
import { FormSection } from "./FormSection";
import type { PriorityItem } from "@/types/visit";
import type { Product } from "@/types/product";
import type { FormErrors } from "../_hooks/useLogVisitValidation";

const MIN_ITEMS = 5;

type PrioritiesSectionProps = {
  products: Product[];
  monthlyItems: PriorityItem[];
  onMonthlyChange: (items: PriorityItem[]) => void;
  annualItems: PriorityItem[];
  onAnnualChange: (items: PriorityItem[]) => void;
  resetKey: string;
  errors: FormErrors;
};

export function PrioritiesSection({
  products,
  monthlyItems,
  onMonthlyChange,
  annualItems,
  onAnnualChange,
  resetKey,
  errors,
}: PrioritiesSectionProps) {
  return (
    <>
      {/* Monthly Priorities */}
      <FormSection step={3} title="Monthly Priorities" badge="Min 5 items">
        <PriorityList
          products={products}
          initialItems={monthlyItems}
          resetKey={resetKey}
          onChange={onMonthlyChange}
          minItems={MIN_ITEMS}
          required
          error={errors.monthly}
        />
      </FormSection>

      {/* Annual Priorities */}
      <FormSection step={4} title="Annual Priorities" badge="Min 5 items">
        <PriorityList
          products={products}
          initialItems={annualItems}
          resetKey={resetKey}
          onChange={onAnnualChange}
          minItems={MIN_ITEMS}
          required
          error={errors.annually}
        />
      </FormSection>
    </>
  );
}
