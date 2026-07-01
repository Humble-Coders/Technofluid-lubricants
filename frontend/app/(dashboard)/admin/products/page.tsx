// File: frontend/app/(dashboard)/admin/products/page.tsx
"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  mapAndValidateRows,
  parseProductMasterFile,
  ProductMasterFileError,
  type ProductImportResult,
} from "@/lib/services/productImport";
import { upsertProducts } from "@/lib/services/productMasterService";
import { ImportPreview } from "./_components/ImportPreview";

type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
};

export default function ImportProductsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setResult(null);
    setSummary(null);
    setIsParsing(true);

    try {
      const rawRows = await parseProductMasterFile(file);
      setResult(mapAndValidateRows(rawRows));
    } catch (err) {
      setError(
        err instanceof ProductMasterFileError
          ? err.message
          : "Something went wrong reading this file.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!result || result.valid.length === 0) return;

    setIsImporting(true);
    try {
      const { created, updated } = await upsertProducts(result.valid);
      setSummary({ created, updated, skipped: result.invalid.length });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Import failed while writing to Firestore.",
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setFileName(null);
    setError(null);
    setResult(null);
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-textPrimary">
          Import Products
        </h1>
        <p className="mt-1 text-sm text-textSecondary">
          Upload the product master .xlsx to preview and upsert the catalog
          by SKU. Nothing is written until you confirm.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="text-sm text-textPrimary file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accentContrast"
          />
          {fileName && (
            <span className="text-sm text-textSecondary">{fileName}</span>
          )}
          {(result || error) && (
            <Button variant="secondary" onClick={handleReset}>
              Clear
            </Button>
          )}
        </div>
        {isParsing && (
          <p className="mt-3 text-sm text-textSecondary">Parsing file...</p>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </Card>

      {result && !summary && (
        <>
          <ImportPreview result={result} />
          {/* Spacer so the floating bar never covers the last table rows */}
          <div className="h-20" />
          <div className="fixed inset-x-0 bottom-0 z-50 flex justify-end border-t border-border bg-surface/95 px-6 py-4 shadow-lg backdrop-blur">
            <Button
              onClick={handleConfirm}
              isLoading={isImporting}
              disabled={result.valid.length === 0}
            >
              Confirm import ({result.valid.length} rows)
            </Button>
          </div>
        </>
      )}

      {summary && (
        <Card>
          <h2 className="text-sm font-semibold text-textPrimary">
            Import complete
          </h2>
          <p className="mt-2 text-sm text-textPrimary">
            Created: {summary.created} · Updated: {summary.updated} · Skipped
            (invalid): {summary.skipped}
          </p>
        </Card>
      )}
    </div>
  );
}
