import { Card } from "@/components/ui/card";

export type FormSectionProps = {
  step: number;
  title: string;
  badge?: string;
  children: React.ReactNode;
};

export function FormSection({
  step,
  title,
  badge,
  children,
}: FormSectionProps) {
  return (
    <Card>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accentContrast">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-textPrimary">{title}</h2>
        {badge && (
          <span className="ml-auto rounded-full bg-page px-2.5 py-0.5 text-xs font-medium text-textSecondary">
            {badge}
          </span>
        )}
      </div>
      {children}
    </Card>
  );
}
