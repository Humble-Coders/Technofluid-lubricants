"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/modal";
import { updateProduct } from "@/lib/api/admin";
import type { ProductMaster } from "@/types/productMaster";
import { ProductForm } from "./ProductForm";

type EditProductModalProps = {
  product: ProductMaster | null;
  onClose: () => void;
  onSaved: () => void;
};

export function EditProductModal({
  product,
  onClose,
  onSaved,
}: EditProductModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!product) return null;

  return (
    <Modal
      isOpen={!!product}
      title={`Edit ${product.product}`}
      onClose={onClose}
      mode="workspace"
    >
      <ProductForm
        product={product}
        skuEditable={false}
        isSubmitting={isSubmitting}
        onCancel={onClose}
        onSubmit={async ({ sku, ...fields }) => {
          setIsSubmitting(true);
          try {
            await updateProduct({ sku, fields });
            onSaved();
            onClose();
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
    </Modal>
  );
}
