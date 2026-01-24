// src/components/ui/DataTable.tsx
import React from "react";

export function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className = "",
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      className={[
        "bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600",
        className,
      ].join(" ")}
    >
      {children}
    </th>
  );
}

export function Tr({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...rest}
      className={[
        "border-t border-slate-200 hover:bg-slate-50/60",
        className,
      ].join(" ")}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className = "",
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...rest} className={["px-4 py-3 text-slate-700", className].join(" ")}>
      {children}
    </td>
  );
}
