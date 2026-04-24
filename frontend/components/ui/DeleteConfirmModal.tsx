"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type DeleteConfirmModalProps = {
  open: boolean;
  name: string;
  title?: string;
  description?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteConfirmModal({
  open,
  name,
  title = "Delete",
  description,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      title={title}
      onClose={onClose}
      mode="dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Deleting..." : "Delete"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900 dark:text-red-100">
            {error}
          </div>
        )}
        <p className="text-sm text-textSecondary">
          {description ?? (
            <>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-textPrimary">{name}</span>?
              This action cannot be undone.
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
