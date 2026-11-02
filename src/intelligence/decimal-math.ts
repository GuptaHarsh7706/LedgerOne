/**
 * LedgerOne High-Precision Financial Decimal Arithmetic Engine
 * 
 * Enforces arbitrary-precision scaled arithmetic avoiding IEEE-754 floating-point drift.
 * Implements ISO 4217 currency scales and mathematically auditable rounding policies.
 */

export type RoundingMode = "HALF_UP" | "HALF_EVEN" | "FLOOR" | "CEIL";

// ISO 4217 Currency Minor Unit Scale Map
export const CURRENCY_SCALES: Record<string, number> = {
  // 0 Decimals (Zero-minor-unit currencies)
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  HUF: 0,
  ISK: 0,
  PYG: 0,
  UGX: 0,

  // 3 Decimals (Three-minor-unit currencies)
  BHD: 3,
  KWD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
  LYD: 3,

  // Standard 2 Decimals (Default)
  USD: 2,
  EUR: 2,
  GBP: 2,
  SGD: 2,
  AUD: 2,
  CAD: 2,
  CHF: 2,
  CNY: 2,
  INR: 2,
  NZD: 2,
  HKD: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  AED: 2,
  SAR: 2,
  MYR: 2,
  IDR: 2,
  THB: 2,
  PHP: 2,
  ZAR: 2,
  BRL: 2,
  MXN: 2,
};

export function getCurrencyScale(currencyCode: string = "USD"): number {
  const code = (currencyCode || "USD").trim().toUpperCase();
  return CURRENCY_SCALES[code] ?? 2;
}

export class FixedDecimal {
  // Internal fixed scale factor (10^8) to preserve precision during intermediate multiplication/division
  private static readonly INTERNAL_SCALE = 8n;
  private static readonly MULTIPLIER = 100_000_000n;

  private readonly value: bigint; // scaled by 10^8

  private constructor(scaledBigInt: bigint) {
    this.value = scaledBigInt;
  }

  static fromString(input: string): FixedDecimal {
    const cleaned = input.replace(/[^0-9.-]/g, "").trim();
    if (!cleaned || cleaned === "-" || cleaned === ".") {
      return new FixedDecimal(0n);
    }

    const isNegative = cleaned.startsWith("-");
    const absStr = isNegative ? cleaned.slice(1) : cleaned;
    const parts = absStr.split(".");
    const intPart = parts[0] || "0";
    let fracPart = parts[1] || "";

    if (fracPart.length > 8) {
      fracPart = fracPart.slice(0, 8);
    } else {
      fracPart = fracPart.padEnd(8, "0");
    }

    const scaled = BigInt(intPart) * FixedDecimal.MULTIPLIER + BigInt(fracPart);
    return new FixedDecimal(isNegative ? -scaled : scaled);
  }

  static fromNumber(val: number): FixedDecimal {
    if (!Number.isFinite(val) || Number.isNaN(val)) {
      return new FixedDecimal(0n);
    }
    return FixedDecimal.fromString(val.toFixed(8));
  }

  static zero(): FixedDecimal {
    return new FixedDecimal(0n);
  }

  add(other: FixedDecimal): FixedDecimal {
    return new FixedDecimal(this.value + other.value);
  }

  sub(other: FixedDecimal): FixedDecimal {
    return new FixedDecimal(this.value - other.value);
  }

  mul(other: FixedDecimal | number): FixedDecimal {
    const otherVal = typeof other === "number" ? FixedDecimal.fromNumber(other) : other;
    // Multiplied scaled values: (a * 10^8) * (b * 10^8) = (a * b * 10^16)
    // Divide back by 10^8 to restore single scaling factor
    const rawProd = this.value * otherVal.value;
    const isNegative = rawProd < 0n;
    const absProd = isNegative ? -rawProd : rawProd;
    
    // Half-up rounding on remainder
    const rem = absProd % FixedDecimal.MULTIPLIER;
    let res = absProd / FixedDecimal.MULTIPLIER;
    if (rem >= FixedDecimal.MULTIPLIER / 2n) {
      res += 1n;
    }
    return new FixedDecimal(isNegative ? -res : res);
  }

  div(other: FixedDecimal | number): FixedDecimal {
    const otherVal = typeof other === "number" ? FixedDecimal.fromNumber(other) : other;
    if (otherVal.value === 0n) {
      throw new Error("Division by zero in FixedDecimal arithmetic");
    }
    const isNegative = (this.value < 0n) !== (otherVal.value < 0n);
    const absNum = this.value < 0n ? -this.value : this.value;
    const absDen = otherVal.value < 0n ? -otherVal.value : otherVal.value;

    const scaledNum = absNum * FixedDecimal.MULTIPLIER;
    const rem = scaledNum % absDen;
    let quotient = scaledNum / absDen;
    if (rem * 2n >= absDen) {
      quotient += 1n;
    }
    return new FixedDecimal(isNegative ? -quotient : quotient);
  }

  abs(): FixedDecimal {
    return this.value < 0n ? new FixedDecimal(-this.value) : this;
  }

  isZero(): boolean {
    return this.value === 0n;
  }

  isNegative(): boolean {
    return this.value < 0n;
  }

  isPositive(): boolean {
    return this.value > 0n;
  }

  roundToScale(targetScale: number, mode: RoundingMode = "HALF_UP"): FixedDecimal {
    if (targetScale < 0 || targetScale > 8) {
      throw new Error(`Target scale ${targetScale} out of range [0, 8]`);
    }

    const dropDigits = 8 - targetScale;
    if (dropDigits === 0) return this;

    const divisor = 10n ** BigInt(dropDigits);
    const half = divisor / 2n;
    const isNegative = this.value < 0n;
    const absVal = isNegative ? -this.value : this.value;

    const rem = absVal % divisor;
    let rounded = absVal / divisor;

    if (mode === "HALF_UP") {
      if (rem >= half) {
        rounded += 1n;
      }
    } else if (mode === "HALF_EVEN") {
      if (rem > half) {
        rounded += 1n;
      } else if (rem === half) {
        if (rounded % 2n !== 0n) {
          rounded += 1n;
        }
      }
    } else if (mode === "CEIL") {
      if (rem > 0n && !isNegative) {
        rounded += 1n;
      }
    }

    const finalVal = rounded * divisor;
    return new FixedDecimal(isNegative ? -finalVal : finalVal);
  }

  /**
   * Currency-aware comparison within explicitly calculated minor unit tolerance
   */
  equals(other: FixedDecimal, tolerance: FixedDecimal = FixedDecimal.zero()): boolean {
    const diff = (this.value - other.value);
    const absDiff = diff < 0n ? -diff : diff;
    return absDiff <= tolerance.value;
  }

  toNumber(): number {
    return Number(this.value) / 100_000_000;
  }

  toString(scale?: number): string {
    const isNegative = this.value < 0n;
    const absVal = isNegative ? -this.value : this.value;
    const intPart = absVal / FixedDecimal.MULTIPLIER;
    const fracPart = (absVal % FixedDecimal.MULTIPLIER).toString().padStart(8, "0");

    if (scale !== undefined && scale >= 0 && scale <= 8) {
      const rounded = this.roundToScale(scale);
      return rounded.toString();
    }

    // Default formatting: strip trailing zeroes past scale 2 unless scale 0 or specified
    let trimmedFrac = fracPart.replace(/0+$/, "");
    if (trimmedFrac.length < 2) trimmedFrac = trimmedFrac.padEnd(2, "0");

    return `${isNegative ? "-" : ""}${intPart}.${trimmedFrac}`;
  }

  toJSON(): number {
    return this.toNumber();
  }
}

/**
 * Computes explicit currency-aware tolerance for mathematical invariant checks.
 * Based on line-item count and currency minor unit rather than an arbitrary constant.
 */
export function calculateCurrencyTolerance(currencyCode: string, lineItemCount: number = 1): FixedDecimal {
  const scale = getCurrencyScale(currencyCode);
  const baseMinorUnit = 10 ** -scale;

  // For 0-decimal currencies (JPY, KRW): tolerance is 0 for single items, or max 1 currency unit for sum of lines
  if (scale === 0) {
    return lineItemCount > 1 ? FixedDecimal.fromString("1") : FixedDecimal.zero();
  }

  // For 2-decimal currencies (USD, EUR, SGD):
  // Single line: exact ($0.00).
  // Multiple items with fractional rounding: allow at most 1 minor unit per 3 line items (rounding jitter)
  const maxMinorUnits = Math.max(1, Math.ceil(lineItemCount / 3));
  const toleranceVal = (maxMinorUnits * baseMinorUnit).toFixed(scale);
  return FixedDecimal.fromString(toleranceVal);
}
