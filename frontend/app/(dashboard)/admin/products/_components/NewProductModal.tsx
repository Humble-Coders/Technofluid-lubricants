"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/modal";
import { createProduct } from "@/lib/api/admin";
import { ProductForm } from "./ProductForm";

type NewProductModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function NewProductModal({
  open,
  onClose,
  onCreated,
}: NewProductModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  return (
    <Modal isOpen={open} title="New product" onClose={onClose} mode="workspace">
      <ProductForm
        skuEditable
        isSubmitting={isSubmitting}
        onCancel={onClose}
        onSubmit={async (payload) => {
          setIsSubmitting(true);
          try {
            await createProduct(payload);
            onCreated();
            onClose();
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
    </Modal>
  );
}
