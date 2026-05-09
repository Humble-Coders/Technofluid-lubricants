"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useProducts } from "@/lib/useProducts";
import { useServiceAreas } from "@/lib/useServiceAreas";
import { saveDistributorFirmData } from "@/lib/services/firmService";
import { GstDistributorLookup } from "./GstDistributorLookup";
import { ServiceAreaCombobox } from "./ServiceAreaCombobox";

export type EditDistributorFields = {
  name: string;
  phone: string;
  gstNumber?: string;
  address?: string;
  serviceArea?: string;
  productCategories?: string[];
};

type EditDistributorModalProps = {
  open: boolean;
  initial: EditDistributorFields & { id: string };
  onClose: () => void;
  onSave: (id: string, fields: EditDistributorFields) => Promise<void>;
};

export function EditDistributorModal({
  open,
  initial,
  onClose,
  onSave,
}: EditDistributorModalProps) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [gstNumber, setGstNumber] = useState(initial.gstNumber ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [serviceArea, setServiceArea] = useState(initial.serviceArea ?? "");
  const [productCategories, setProductCategories] = useState<string[]>(
    initial.productCategories ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const { products } = useProducts();
  const existingServiceAreas = useServiceAreas();

  const availableCategories = useMemo(() => {
    const seen = new Set<string>();
    products.forEach((p) => {
      if (p.category) seen.add(p.category);
    });
    return Array.from(seen).sort();
  }, [products]);

  useEffect(() => {
    if (open) {
      setName(initial.name);
      setPhone(initial.phone);
      setGstNumber(initial.gstNumber ?? "");
      setAddress(initial.address ?? "");
      setServiceArea(initial.serviceArea ?? "");
      setProductCategories(initial.productCategories ?? []);
      setErrors({});
    }
  }, [open, initial]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required.";
    const phoneClean = phone.trim();
    if (!phoneClean) {
      next.phone = "Phone is required.";
    } else if (!/^[+\d\s\-()]{7,15}$/.test(phoneClean)) {
      next.phone = "Enter a valid phone number.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const toggleCategory = (cat: string) => {
    setProductCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      const fields: EditDistributorFields = {
        name: name.trim(),
        phone: phone.trim(),
        gstNumber: gstNumber.trim() || undefined,
        address: address.trim() || undefined,
        serviceArea: serviceArea.trim() || undefined,
        productCategories: productCategories.length > 0 ? productCategories : undefined,
      };

      await onSave(initial.id, fields);

      if (fields.gstNumber) {
        saveDistributorFirmData(fields.gstNumber, fields.name, fields.address).catch(() => {});
      }

      onClose();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Failed to update" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      title="Edit Distributor"
      onClose={onClose}
      mode="workspace"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {errors.form && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {errors.form}
          </div>
        )}

        {/* Basic info */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="edit-dist-name"
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((p) => ({ ...p, name: undefined }));
            }}
            error={errors.name}
            disabled={isLoading}
          />
          <Input
            id="edit-dist-phone"
            label="Phone"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setErrors((p) => ({ ...p, phone: undefined }));
            }}
            error={errors.phone}
            disabled={isLoading}
          />
        </div>

        {/* GST lookup — auto-fills name + address */}
        <GstDistributorLookup
          gstNumber={gstNumber}
          firmName={name}
          address={address}
          onGstChange={setGstNumber}
          onNameChange={setName}
          onAddressChange={setAddress}
          disabled={isLoading}
        />

        {/* Service area */}
        <ServiceAreaCombobox
          value={serviceArea}
          options={existingServiceAreas}
          onChange={setServiceArea}
          disabled={isLoading}
        />

        {/* Product categories */}
        {availableCategories.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-textPrimary">
              Product Categories
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {availableCategories.map((cat) => (
                <label
                  key={cat}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    productCategories.includes(cat)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-page text-textPrimary hover:border-accent/50"
                  } ${isLoading ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={productCategories.includes(cat)}
                    onChange={() => !isLoading && toggleCategory(cat)}
                    disabled={isLoading}
                    className="h-4 w-4 shrink-0 rounded border-border accent-[color:var(--color-accent)]"
                  />
                  {cat}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
