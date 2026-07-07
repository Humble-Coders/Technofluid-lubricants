// File: frontend/app/(public)/products/[slug]/_components/SeriesSpecTable.tsx
import type { SpecTable } from "@/types/content";

export default function SeriesSpecTable({ table }: { table: SpecTable }) {
  const [headerRow, ...bodyRows] = table;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="bg-black/[0.03]">
            {headerRow.map((cell, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-2.5 py-2 font-semibold text-textPrimary sm:px-4 sm:py-3"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-t border-border odd:bg-white even:bg-black/[0.015]"
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2.5 py-2 text-textSecondary sm:px-4 sm:py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
