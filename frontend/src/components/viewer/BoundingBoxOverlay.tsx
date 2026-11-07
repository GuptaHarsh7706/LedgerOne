"use client";

import React from "react";
import { BoundingBox, ExtractedField, ExtractedLineItem } from "@/lib/api-client";

interface BoundingBoxOverlayProps {
  fields: ExtractedField[];
  lineItems: ExtractedLineItem[];
  activeFieldKey: string | null;
  onSelectField: (fieldKey: string) => void;
  scale?: number;
}

export function BoundingBoxOverlay({
  fields,
  lineItems,
  activeFieldKey,
  onSelectField,
}: BoundingBoxOverlayProps) {
  // Width & height baseline of the simulated high-DPI document canvas: 600 x 800
  const canvasWidth = 600;
  const canvasHeight = 800;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
    >
      {/* 1. Line Item Bounding Boxes */}
      {lineItems.map((li) => {
        if (!li.bounding_box) return null;
        const boxKey = `line_${li.line_number}`;
        const isActive = activeFieldKey === boxKey;
        const { x0, y0, x1, y1 } = li.bounding_box;
        const width = x1 - x0;
        const height = y1 - y0;

        return (
          <g key={boxKey} className="pointer-events-auto cursor-pointer">
            <rect
              x={x0}
              y={y0}
              width={width}
              height={height}
              onClick={() => onSelectField(boxKey)}
              className={`transition-all duration-150 ${
                isActive
                  ? "fill-amber-500/20 stroke-amber-400 stroke-2 bounding-box-active"
                  : "fill-indigo-500/5 stroke-indigo-500/40 stroke-1 hover:fill-indigo-500/15 hover:stroke-indigo-400"
              }`}
            />
            {isActive && (
              <text
                x={x0}
                y={y0 - 4}
                className="fill-amber-400 text-[10px] font-mono font-bold"
              >
                Line #{li.line_number}
              </text>
            )}
          </g>
        );
      })}

      {/* 2. Scalar Field Bounding Boxes */}
      {fields.map((field) => {
        if (!field.bounding_box) return null;
        const isActive = activeFieldKey === field.name;
        const { x0, y0, x1, y1 } = field.bounding_box;
        const width = x1 - x0;
        const height = y1 - y0;

        return (
          <g key={field.name} className="pointer-events-auto cursor-pointer">
            <rect
              x={x0}
              y={y0}
              width={width}
              height={height}
              onClick={() => onSelectField(field.name)}
              className={`transition-all duration-150 ${
                isActive
                  ? "fill-amber-500/25 stroke-amber-400 stroke-2 bounding-box-active"
                  : "fill-blue-500/5 stroke-blue-500/40 stroke-1 hover:fill-blue-500/20 hover:stroke-blue-400"
              }`}
            />
            {isActive && (
              <g>
                <rect
                  x={x0}
                  y={y0 - 16}
                  width={field.label.length * 6 + 12}
                  height={14}
                  rx={2}
                  className="fill-black/80 stroke stroke-amber-500/40"
                />
                <text
                  x={x0 + 6}
                  y={y0 - 5}
                  className="fill-amber-300 text-[9px] font-mono font-semibold"
                >
                  {field.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
