import { Hammer, ShieldOff } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/ui";

/** Screens that exist in the navigation but are being built next. */
export function ComingNext({ title, description }: { title: string; description: string }) {
  return (
    <Page>
      <PageHeader title={title} />
      <EmptyState icon={<Hammer />} title={`${title} is being built`}>
        {description}
      </EmptyState>
    </Page>
  );
}

export function NoAccess() {
  return (
    <Page>
      <PageHeader title="No access" />
      <EmptyState icon={<ShieldOff />} title="This screen isn't part of your role">
        Ask the admin if you need access.
      </EmptyState>
    </Page>
  );
}
