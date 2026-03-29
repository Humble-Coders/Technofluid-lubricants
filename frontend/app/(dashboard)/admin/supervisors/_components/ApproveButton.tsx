// File: frontend/app/(dashboard)/admin/supervisors/_components/ApproveButton.tsx
"use client";

import { Button } from "@/components/ui/button";

type ApproveButtonProps = {
  onApprove: () => void;
  disabled?: boolean;
};

export function ApproveButton({
  onApprove,
  disabled = false,
}: ApproveButtonProps) {
  return (
    <Button
      variant="secondary"
      className="h-9 px-3"
      onClick={onApprove}
      disabled={disabled}
    >
      Approve
    </Button>
  );
}
