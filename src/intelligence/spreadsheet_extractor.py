"""
Spreadsheet and Tabular Data Extraction Engine.

Implements:
1. XLSX extraction with dual-pass formula vs. cached-value inspection via openpyxl.
   - Preserves formula strings (e.g. '=SUM(B2:B10)') and cached evaluated values separately.
   - Explicitly flags formula_cached_value_missing = True when cached value is None.
2. High-throughput CSV extraction via Polars with schema detection and Markdown table preview.
"""
from __future__ import annotations

import io
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import openpyxl
import polars as pl

from src.intelligence.models import (
    CsvExtractionResult,
    SpreadsheetCell,
    SpreadsheetExtractionResult,
    SpreadsheetSheet,
)


class SpreadsheetExtractor:
    """
    Tabular extraction engine supporting XLSX spreadsheets and CSV records.
    """

    @staticmethod
    def extract_xlsx(
        file_source: Union[str, Path, bytes, io.BytesIO],
    ) -> SpreadsheetExtractionResult:
        """
        Extract XLSX workbook using dual-pass loading:
        - Pass 1 (data_only=False): extracts formulas and raw cell content.
        - Pass 2 (data_only=True): extracts Excel's cached evaluated results.
        Flags formula_cached_value_missing = True when a formula exists without a cached result.
        """
        start_time = time.perf_counter()

        if isinstance(file_source, (str, Path)):
            with open(file_source, "rb") as f:
                content_bytes = f.read()
        elif isinstance(file_source, io.BytesIO):
            content_bytes = file_source.getvalue()
        else:
            content_bytes = file_source

        # Pass 1: Formulas
        bio_formulas = io.BytesIO(content_bytes)
        wb_formulas = openpyxl.load_workbook(bio_formulas, data_only=False, read_only=False)

        # Pass 2: Evaluated cached values
        bio_values = io.BytesIO(content_bytes)
        wb_values = openpyxl.load_workbook(bio_values, data_only=True, read_only=False)

        sheets: List[SpreadsheetSheet] = []
        total_cells = 0
        total_formulas = 0
        total_missing_cached = 0

        for sheet_name in wb_formulas.sheetnames:
            ws_f = wb_formulas[sheet_name]
            ws_v = wb_values[sheet_name] if sheet_name in wb_values.sheetnames else None

            max_row = ws_f.max_row or 0
            max_col = ws_f.max_column or 0

            sheet_cells: List[SpreadsheetCell] = []
            sheet_formulas = 0
            sheet_missing_cached = 0

            # Scan cells
            for row_idx in range(1, max_row + 1):
                for col_idx in range(1, max_col + 1):
                    cell_f = ws_f.cell(row=row_idx, column=col_idx)
                    cell_val = cell_f.value

                    # Skip empty cells
                    if cell_val is None and (ws_v is None or ws_v.cell(row=row_idx, column=col_idx).value is None):
                        continue

                    coord = cell_f.coordinate
                    val_str = str(cell_val) if cell_val is not None else ""
                    is_formula = (
                        cell_f.data_type == "f" or
                        (isinstance(cell_val, str) and cell_val.startswith("="))
                    )

                    cached_val = None
                    missing_cached = False

                    if is_formula:
                        sheet_formulas += 1
                        total_formulas += 1
                        formula_str = val_str
                        if ws_v is not None:
                            cached_val = ws_v.cell(row=row_idx, column=col_idx).value
                        if cached_val is None:
                            missing_cached = True
                            sheet_missing_cached += 1
                            total_missing_cached += 1
                    else:
                        formula_str = None
                        cached_val = cell_val

                    sheet_cells.append(
                        SpreadsheetCell(
                            coordinate=coord,
                            row=row_idx,
                            col=col_idx,
                            raw_value=cell_val,
                            formatted_value=str(cached_val if cached_val is not None else val_str),
                            data_type=cell_f.data_type,
                            is_formula=is_formula,
                            formula=formula_str,
                            cached_value=cached_val,
                            formula_cached_value_missing=missing_cached,
                        )
                    )
                    total_cells += 1

            # Extract defined tables if present
            tables: List[Dict[str, Any]] = []
            if hasattr(ws_f, "tables") and ws_f.tables:
                for tbl_name, tbl_obj in ws_f.tables.items():
                    tables.append({
                        "name": tbl_name,
                        "range": getattr(tbl_obj, "ref", ""),
                    })

            sheets.append(
                SpreadsheetSheet(
                    sheet_name=sheet_name,
                    max_row=max_row,
                    max_column=max_col,
                    cells=sheet_cells,
                    tables=tables,
                    summary={
                        "cell_count": len(sheet_cells),
                        "formula_count": sheet_formulas,
                        "missing_cached_formulas": sheet_missing_cached,
                    },
                )
            )

        wb_formulas.close()
        wb_values.close()

        duration = time.perf_counter() - start_time

        return SpreadsheetExtractionResult(
            sheets=sheets,
            total_cells=total_cells,
            total_formulas=total_formulas,
            total_missing_cached_formulas=total_missing_cached,
            duration_seconds=round(duration, 4),
        )

    @staticmethod
    def extract_csv(
        file_source: Union[str, Path, bytes, io.BytesIO],
        max_preview_rows: int = 50,
    ) -> CsvExtractionResult:
        """
        Extract CSV data using Polars for ultra-fast, typed schema inspection.
        Generates markdown table representation for downstream LLM prompts.
        """
        start_time = time.perf_counter()

        if isinstance(file_source, (str, Path)):
            df = pl.read_csv(file_source, infer_schema_length=1000)
        elif isinstance(file_source, bytes):
            df = pl.read_csv(io.BytesIO(file_source), infer_schema_length=1000)
        else:
            df = pl.read_csv(file_source, infer_schema_length=1000)

        headers = list(df.columns)
        dtypes = {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)}
        row_count = df.height
        column_count = df.width

        # Count nulls per column
        null_counts = {col: int(df[col].null_count()) for col in df.columns}

        # Convert records to native python dicts
        records = df.to_dicts()

        # Build Markdown table representation
        md_lines: List[str] = []
        md_lines.append("| " + " | ".join(headers) + " |")
        md_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")

        preview_rows = records[:max_preview_rows]
        for row in preview_rows:
            row_vals = [str(row.get(h, "")) if row.get(h) is not None else "" for h in headers]
            md_lines.append("| " + " | ".join(row_vals) + " |")

        if row_count > max_preview_rows:
            md_lines.append(f"| ... ({row_count - max_preview_rows} more rows) ... |")

        markdown_table = "\n".join(md_lines)
        duration = time.perf_counter() - start_time

        return CsvExtractionResult(
            headers=headers,
            dtypes=dtypes,
            row_count=row_count,
            column_count=column_count,
            null_counts=null_counts,
            records=records,
            markdown_table=markdown_table,
            duration_seconds=round(duration, 4),
        )
