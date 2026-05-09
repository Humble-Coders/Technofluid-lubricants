import { Card } from "@/components/ui/card";

type CreateFormSectionProps = {
  step: number;
  title: string;
  children: React.ReactNode;
};

export function CreateFormSection({ step, title, children }: CreateFormSectionProps) {
  return (
    <Card>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accentContrast">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-textPrimary">{title}</h2>
      </div>
      {children}
    </Card>
  );
}
