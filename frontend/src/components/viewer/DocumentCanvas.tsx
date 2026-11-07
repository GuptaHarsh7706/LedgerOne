"use client";

import React, { useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { BoundingBoxOverlay } from "./BoundingBoxOverlay";
import { ExtractedField, ExtractedLineItem } from "@/lib/api-client";

interface DocumentCanvasProps {
  fields: ExtractedField[];
  lineItems: ExtractedLineItem[];
  activeFieldKey: string | null;
  onSelectField: (key: string) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function DocumentCanvas({
  fields,
  lineItems,
  activeFieldKey,
  onSelectField,
  currentPage,
  totalPages,
  onPageChange,
}: DocumentCanvasProps) {
  const [zoom, setZoom] = useState<number>(100);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 200));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 50));
  const handleZoomReset = () => setZoom(100);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050608] min-w-0 overflow-hidden select-none">
      {/* Top Floating Controls Bar */}
      <div className="h-11 px-4 border-b border-hairline bg-surface-subtle/80 backdrop-blur flex items-center justify-between z-20">
        {/* Page Nav */}
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-surface-hover text-ink-muted disabled:opacity-40 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-ink-secondary text-xs">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-surface-hover text-ink-muted disabled:opacity-40 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 bg-surface-card px-2 py-1 rounded-lg border border-hairline text-xs">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-surface-hover text-ink-muted hover:text-ink-primary transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-12 text-center font-mono text-[11px] text-ink-secondary">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-surface-hover text-ink-muted hover:text-ink-primary transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3 bg-hairline mx-1" />
          <button
            onClick={handleZoomReset}
            className="p-1 rounded hover:bg-surface-hover text-ink-muted hover:text-ink-primary transition"
            title="Fit to Width"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* OCR Coordinate Inspection Hint */}
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-ink-muted">
          <Eye className="w-3 h-3 text-brand-light" />
          <span>Click any bounding box to inspect evidence</span>
        </div>
      </div>

      {/* Viewport Canvas with Center Scroll */}
      <div className="flex-1 overflow-auto p-8 flex justify-center items-start">
        <div
          className="relative bg-white text-slate-900 rounded shadow-2xl transition-transform duration-150 origin-top shrink-0"
          style={{
            width: "600px",
            minHeight: "800px",
            transform: `scale(${zoom / 100})`,
          }}
        >
          {/* Simulated High-Fidelity Invoice Document Rendering */}
          <div className="p-8 font-sans text-xs space-y-6">
            {/* Header: Company & Invoice Info */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  DataCore Enterprise Inc.
                </h1>
                <p className="text-[11px] text-slate-600 mt-1">
                  100 Technology Plaza, Suite 400
                  <br />
                  Silicon Valley, CA 94025
                  <br />
                  Tax ID: US-8829104-X
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block px-2 py-0.5 bg-slate-900 text-white text-[10px] font-bold tracking-widest uppercase">
                  INVOICE
                </span>
                <p className="font-mono font-bold text-sm text-slate-900 mt-2">
                  INV-2026-9041
                </p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  DATE: Nov 5, 2026
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  DUE: Dec 5, 2026
                </p>
              </div>
            </div>

            {/* Bill To */}
            <div className="grid grid-cols-2 gap-4 text-[11px]">
              <div>
                <span className="font-bold text-slate-500 uppercase text-[9px] block">
                  BILLED TO:
                </span>
                <p className="font-semibold text-slate-900">Apex Global Capital LLC</p>
                <p className="text-slate-600">55 Wall Street, 18th Floor</p>
                <p className="text-slate-600">New York, NY 10005</p>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-500 uppercase text-[9px] block">
                  PAYMENT TERMS:
                </span>
                <p className="text-slate-700 font-mono">Net 30 Days</p>
                <p className="text-slate-700 font-mono">PO Ref: PO-2026-4412</p>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="pt-4">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-900 font-bold text-slate-700">
                    <th className="py-2">Item Description</th>
                    <th className="py-2 text-center">Qty</th>
                    <th className="py-2 text-right">Unit Price</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-2.5">
                      <div className="font-semibold text-slate-900">
                        High-Capacity SAN Storage Node Tier 1
                      </div>
                      <div className="text-[10px] text-slate-500">
                        SKU: SAN-992-DC • 24x NVMe Gen5
                      </div>
                    </td>
                    <td className="py-2.5 text-center font-mono">2</td>
                    <td className="py-2.5 text-right font-mono">$3,600.00</td>
                    <td className="py-2.5 text-right font-mono font-semibold">
                      $7,200.00
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5">
                      <div className="font-semibold text-slate-900">
                        Fiber Channel 32Gb Host Bus Adapter Dual-Port
                      </div>
                      <div className="text-[10px] text-slate-500">
                        SKU: HBA-32G-PCIE • Low Profile
                      </div>
                    </td>
                    <td className="py-2.5 text-center font-mono">4</td>
                    <td className="py-2.5 text-right font-mono">$750.00</td>
                    <td className="py-2.5 text-right font-mono font-semibold">
                      $3,000.00
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Monetary Summary */}
            <div className="pt-6 border-t-2 border-slate-900 flex justify-end">
              <div className="w-56 space-y-1.5 text-right text-[11px]">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-medium">$10,200.00</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Sales Tax (10.0%):</span>
                  <span className="font-mono font-medium">$1,020.00</span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold text-sm border-t border-slate-300 pt-1.5">
                  <span>Total Due:</span>
                  <span className="font-mono text-base">$11,220.00</span>
                </div>
              </div>
            </div>

            {/* Footer / Remittance */}
            <div className="pt-8 text-[9px] text-slate-500 border-t border-slate-200 flex justify-between items-center">
              <div>
                <span>Wire Routing: 021000021 • Account: 9812-441-209</span>
              </div>
              <div>Page 1 of 2</div>
            </div>
          </div>

          {/* Real SVG Bounding Box Layer */}
          <BoundingBoxOverlay
            fields={fields}
            lineItems={lineItems}
            activeFieldKey={activeFieldKey}
            onSelectField={onSelectField}
          />
        </div>
      </div>
    </div>
  );
}
