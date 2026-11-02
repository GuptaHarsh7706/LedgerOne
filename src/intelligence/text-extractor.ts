/**
 * LedgerOne Document Text & Geometry Extraction Engine
 * 
 * Extracts full-text, token-level layout geometries, and normalized bounding boxes
 * ([x_min, y_min, x_max, y_max] normalized 0.0 to 1.0) across multi-page documents.
 */

export interface TokenGeometry {
  text: string;
  pageNumber: number;
  boundingBox: [number, number, number, number]; // [x_min, y_min, x_max, y_max]
  lineIndex: number;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  tokens: TokenGeometry[];
  width: number;
  height: number;
}

export interface DocumentChunkOutput {
  chunkIndex: number;
  pageNumber: number;
  content: string;
  boundingBox: [number, number, number, number];
}

export interface DocumentTextExtraction {
  rawText: string;
  pages: ExtractedPage[];
  chunks: DocumentChunkOutput[];
}

export class DocumentTextExtractor {
  /**
   * Main entrypoint for document text and layout extraction.
   */
  async extract(buffer: Buffer, mimeType: string, filename: string): Promise<DocumentTextExtraction> {
    if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      return this.extractFromPdf(buffer);
    }

    // Fallback for plain text, CSV, or OCR simulation on raster images
    return this.extractFromTextOrRaster(buffer.toString("utf-8"));
  }

  /**
   * High-reliability structural PDF parser with token geometry reconstruction.
   */
  private extractFromPdf(buffer: Buffer): DocumentTextExtraction {
    const content = buffer.toString("binary");
    const pages: ExtractedPage[] = [];

    // Identify page objects or stream blocks
    // Standard PDF page delimiter: /Type /Page or stream / endstream blocks
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let streamMatch: RegExpExecArray | null;
    let pageNumber = 1;
    const pageWidth = 612; // Standard US Letter points
    const pageHeight = 792;

    const streams: string[] = [];
    while ((streamMatch = streamRegex.exec(content)) !== null) {
      streams.push(streamMatch[1]);
    }

    if (streams.length === 0) {
      // Fallback: search for direct text strings in parentheses (Text) Tj
      return this.extractFromTextOrRaster(content);
    }

    for (const stream of streams) {
      const pageTokens: TokenGeometry[] = [];
      const lines: string[] = [];
      let currentLineY = 0;
      let lineIndex = 0;

      // Match PDF text operators: (string) Tj or [(str1)(str2)] TJ, or text matrix: a b c d e f Tm
      const textOpRegex = /(?:(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+Tm)|(?:\(([^)]*)\)\s*Tj)|(?:\[(.*?)\]\s*TJ)|(?:(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+Td)/g;

      let match: RegExpExecArray | null;
      let currentX = 50;
      let currentY = pageHeight - 50;

      while ((match = textOpRegex.exec(stream)) !== null) {
        if (match[5] && match[6]) {
          // Tm matrix: e f are X and Y coordinates
          currentX = parseFloat(match[5]);
          currentY = parseFloat(match[6]);
        } else if (match[9] && match[10]) {
          // Td translation: dx dy
          currentX += parseFloat(match[9]);
          currentY += parseFloat(match[10]);
        } else {
          // Extracted text from Tj or TJ
          let text = "";
          if (match[7] !== undefined) {
            text = match[7];
          } else if (match[8] !== undefined) {
            // TJ array: extract all parenthesized strings
            const tjInner = match[8];
            const tjParts = tjInner.match(/\(([^)]*)\)/g) || [];
            text = tjParts.map((p) => p.slice(1, -1)).join("");
          }

          text = text.replace(/\\([()\\])/g, "$1").trim();
          if (text.length > 0) {
            const tokenWidth = Math.max(15, text.length * 7);
            const tokenHeight = 12;

            // Normalized bounding box: [x_min, y_min, x_max, y_max] from 0.0 to 1.0
            // Invert PDF bottom-up Y coordinate to standard top-down 0.0 to 1.0
            const xMin = Math.max(0, Math.min(1, currentX / pageWidth));
            const yMin = Math.max(0, Math.min(1, (pageHeight - currentY - tokenHeight) / pageHeight));
            const xMax = Math.max(0, Math.min(1, (currentX + tokenWidth) / pageWidth));
            const yMax = Math.max(0, Math.min(1, (pageHeight - currentY) / pageHeight));

            if (Math.abs(currentY - currentLineY) > 8) {
              lineIndex++;
              currentLineY = currentY;
            }

            pageTokens.push({
              text,
              pageNumber,
              boundingBox: [
                parseFloat(xMin.toFixed(4)),
                parseFloat(yMin.toFixed(4)),
                parseFloat(xMax.toFixed(4)),
                parseFloat(yMax.toFixed(4)),
              ],
              lineIndex,
            });

            lines.push(text);
            currentX += tokenWidth + 5;
          }
        }
      }

      // If text operators weren't captured via Tm/Tj, try plain ASCII extraction from stream
      if (lines.length === 0) {
        const plainStrings = stream.match(/\(([^)]{2,})\)/g) || [];
        for (let i = 0; i < plainStrings.length; i++) {
          const raw = plainStrings[i].slice(1, -1).trim();
          if (raw.length > 0 && !/[^\x20-\x7E]/.test(raw)) {
            lines.push(raw);
            pageTokens.push({
              text: raw,
              pageNumber,
              boundingBox: [0.05, Math.min(0.95, 0.05 + i * 0.03), 0.95, Math.min(0.98, 0.08 + i * 0.03)],
              lineIndex: i,
            });
          }
        }
      }

      const pageFullText = lines.join("\n");
      pages.push({
        pageNumber,
        text: pageFullText,
        tokens: pageTokens,
        width: pageWidth,
        height: pageHeight,
      });

      pageNumber++;
    }

    // Reconstruct raw document text
    const rawText = pages.map((p) => p.text).join("\n\n");
    const chunks = this.createChunks(pages);

    return {
      rawText,
      pages,
      chunks,
    };
  }

  /**
   * Text & raster fallback: decomposes plain text lines into geometry grid.
   */
  private extractFromTextOrRaster(rawContent: string): DocumentTextExtraction {
    const cleanContent = rawContent.replace(/\0/g, "").trim();
    const lines = cleanContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

    const tokens: TokenGeometry[] = [];
    const totalLines = Math.max(1, lines.length);

    lines.forEach((line, index) => {
      const yMin = index / totalLines;
      const yMax = (index + 1) / totalLines;
      tokens.push({
        text: line.trim(),
        pageNumber: 1,
        boundingBox: [0.05, parseFloat(yMin.toFixed(4)), 0.95, parseFloat(yMax.toFixed(4))],
        lineIndex: index,
      });
    });

    const page: ExtractedPage = {
      pageNumber: 1,
      text: lines.join("\n"),
      tokens,
      width: 612,
      height: 792,
    };

    const chunks = this.createChunks([page]);

    return {
      rawText: page.text,
      pages: [page],
      chunks,
    };
  }

  /**
   * Chunks page tokens into semantic passages with bounding box envelope.
   */
  private createChunks(pages: ExtractedPage[]): DocumentChunkOutput[] {
    const chunks: DocumentChunkOutput[] = [];
    let chunkIndex = 0;

    for (const page of pages) {
      if (page.tokens.length === 0) continue;

      // Group into windows of 8 tokens or paragraphs
      const windowSize = 8;
      for (let i = 0; i < page.tokens.length; i += windowSize) {
        const slice = page.tokens.slice(i, i + windowSize);
        const content = slice.map((t) => t.text).join(" ");

        // Compute enclosing bounding box
        const xMin = Math.min(...slice.map((t) => t.boundingBox[0]));
        const yMin = Math.min(...slice.map((t) => t.boundingBox[1]));
        const xMax = Math.max(...slice.map((t) => t.boundingBox[2]));
        const yMax = Math.max(...slice.map((t) => t.boundingBox[3]));

        chunks.push({
          chunkIndex: chunkIndex++,
          pageNumber: page.pageNumber,
          content,
          boundingBox: [
            parseFloat(xMin.toFixed(4)),
            parseFloat(yMin.toFixed(4)),
            parseFloat(xMax.toFixed(4)),
            parseFloat(yMax.toFixed(4)),
          ],
        });
      }
    }

    // Ensure at least one chunk exists if pages had text
    if (chunks.length === 0 && pages.length > 0 && pages[0].text) {
      chunks.push({
        chunkIndex: 0,
        pageNumber: 1,
        content: pages[0].text.slice(0, 1000),
        boundingBox: [0.0, 0.0, 1.0, 1.0],
      });
    }

    return chunks;
  }
}
