/** Decimals of the native XLM token, and of every Stellar asset wrapped as a SAC. */
export const STROOP_DECIMALS = 7;

/** Thrown when an amount could not be parsed. */
export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

/**
 * Parse a decimal amount into the integer base units a token contract expects.
 *
 * Done as text rather than arithmetic, so `parseAmount("0.1")` is exactly
 * 1,000,000 stroops and not whatever `0.1 * 1e7` rounds to.
 *
 * ```ts
 * parseAmount("1.5");      // 15_000_000n stroops
 * parseAmount("2", 6);     // 2_000_000n units of a 6-decimal token
 * ```
 *
 * @throws {AmountError} if the text is not a plain decimal number, or has more
 * decimal places than the token can represent.
 */
export function parseAmount(value: string, decimals = STROOP_DECIMALS): bigint {
  const text = value.trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new AmountError(`${JSON.stringify(value)} is not a decimal amount`);
  }

  const [, sign, whole, fraction = ""] = match;
  if (fraction.length > decimals) {
    throw new AmountError(
      `${text} has ${fraction.length} decimal places but the token has only ${decimals}`,
    );
  }

  const units = BigInt(`${whole || "0"}${fraction.padEnd(decimals, "0")}`);
  return sign === "-" ? -units : units;
}

/**
 * Format integer base units as a decimal string, with no trailing zeros.
 *
 * ```ts
 * formatAmount(15_000_000n);  // "1.5"
 * formatAmount(7_000_000n);   // "0.7"
 * ```
 */
export function formatAmount(units: bigint, decimals = STROOP_DECIMALS): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
