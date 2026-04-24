import { Button } from "@/components/ui/button";

type ActionBarProps = {
  isEditing: boolean;
  isSubmitting: boolean;
  onSaveDraft: () => void;
  onSaveSubmit: () => void;
};

export function ActionBar({
  isEditing,
  isSubmitting,
  onSaveDraft,
  onSaveSubmit,
}: ActionBarProps) {
  const saveLabel = isEditing ? "Update" : "Save";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm lg:left-(--admin-sidebar-width,16rem)">
      <div className="mx-auto flex max-w-6xl gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onSaveDraft}
          isLoading={isSubmitting}
          className="flex-1"
        >
          {saveLabel} Draft
        </Button>
        <Button
          type="button"
          onClick={onSaveSubmit}
          isLoading={isSubmitting}
          className="flex-1"
        >
          {saveLabel} Visit
        </Button>
      </div>
    </div>
  );
}
