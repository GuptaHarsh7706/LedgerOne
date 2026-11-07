"use client";

import React from "react";
import { Search } from "lucide-react";
import { DocumentCategory } from "@/lib/tokens";

interface CategoryFilterBarProps {
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalCounts: Record<string, number>;
}

export function CategoryFilterBar({
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  totalCounts,
}: CategoryFilterBarProps) {
  const categories: Array<{ id: string; label: string }> = [
    { id: "ALL", label: "All Documents" },
    { id: "INVOICE", label: "Invoices" },
    { id: "PURCHASE_ORDER", label: "Purchase Orders" },
    { id: "RECEIPT", label: "Goods Receipts" },
    { id: "CONTRACT", label: "Contracts" },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const count = totalCounts[cat.id] ?? 0;

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                isSelected
                  ? "bg-brand/10 text-brand-light border border-brand/20 shadow-sm"
                  : "bg-surface-subtle text-ink-secondary hover:text-ink-primary hover:bg-surface-hover border border-hairline"
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  isSelected
                    ? "bg-brand/20 text-brand-light"
                    : "bg-surface-card text-ink-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Input Filter */}
      <div className="relative w-full sm:w-64 shrink-0">
        <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter by vendor, ID, filename..."
          className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-subtle border border-hairline text-xs text-ink-primary placeholder-ink-muted focus:border-brand-light focus:outline-none transition"
        />
      </div>
    </div>
  );
}
