import React from "react";

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {}

export function Table({ className = "", children, ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-hairline bg-surface-card shadow-subtle-card">
      <table className={`w-full text-left text-xs border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className = "", children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`border-b border-hairline bg-surface-subtle/80 text-[10px] font-mono uppercase tracking-wider text-ink-muted select-none ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ className = "", children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-hairline ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

export function TableRow({ selected = false, className = "", children, ...props }: TableRowProps) {
  return (
    <tr
      className={`hover:bg-surface-hover/70 transition-colors duration-100 group ${
        selected ? "bg-brand/5" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
}

export function TableHead({ align = "left", className = "", children, ...props }: TableHeadProps) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`py-2.5 px-3 font-semibold ${alignClass} ${className}`} {...props}>
      {children}
    </th>
  );
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
  numeric?: boolean;
  mono?: boolean;
}

export function TableCell({ align = "left", numeric = false, mono = false, className = "", children, ...props }: TableCellProps) {
  const alignClass = align === "right" || numeric ? "text-right" : align === "center" ? "text-center" : "text-left";
  const numClass = numeric || mono ? "font-mono tabular-nums text-ink-primary font-medium" : "text-ink-secondary";
  return (
    <td className={`py-2.5 px-3 ${alignClass} ${numClass} ${className}`} {...props}>
      {children}
    </td>
  );
}

export function TableCaption({ className = "", children, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption className={`p-3 text-[11px] text-ink-muted ${className}`} {...props}>
      {children}
    </caption>
  );
}
