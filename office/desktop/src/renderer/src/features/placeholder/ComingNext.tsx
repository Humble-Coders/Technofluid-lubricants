import { Hammer, ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/ui";

/** Screens that exist in the navigation but are being built next. */
export function ComingNext({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState icon={<Hammer className="size-6" />} title={`${title} is being built`}>
      {description}
    </EmptyState>
  );
}

export function NoAccess() {
  return (
    <EmptyState icon={<ShieldOff className="size-6" />} title="This screen isn't part of your role">
      Ask the admin if you need access.
    </EmptyState>
  );
}
