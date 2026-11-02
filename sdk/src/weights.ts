import type { Payee, Recipient } from "./bindings.js";

/**
 * Weights are parts per million and every split's weights must add up to
 * exactly this. The contract rejects anything else with `WeightsDoNotSumToTotal`.
 */
export const TOTAL_WEIGHT = 1_000_000;

/** The most recipients one split can hold. */
export const MAX_RECIPIENTS = 50;

/** Thrown when a recipient list could not be built, or would be rejected on-chain. */
export class WeightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeightError";
  }
}

/** A recipient that is an ordinary account or contract address. */
export function account(address: string): Payee {
  return { tag: "Account", values: [address] as const };
}

/** A recipient that is another split in the same contract, settled with `pull`. */
export function nested(splitId: bigint | number): Payee {
  return { tag: "Split", values: [BigInt(splitId)] as const };
}

/** How a payee reads back as a stable string, for comparisons and messages. */
export function payeeKey(payee: Payee): string {
  return payee.tag === "Account" ? `account:${payee.values[0]}` : `split:${payee.values[0]}`;
}

/** One payee and its share, in whatever units you like: 70/30, 1/3, 12.5/87.5. */
export interface Share {
  payee: Payee;
  share: number | bigint;
}

/**
 * Turn shares in arbitrary units into ppm weights that add up to exactly
 * {@link TOTAL_WEIGHT}.
 *
 * Shares are relative, so `[70, 30]`, `[7, 3]` and `[0.7, 0.3]` all describe
 * the same split. The leftover from rounding is handed out by the largest
 * remainder method — the payees whose exact share was cut by the most get the
 * spare units — so the result is deterministic and never off by one.
 *
 * ```ts
 * recipientsFromShares([
 *   { payee: account(alice), share: 70 },
 *   { payee: account(bob), share: 30 },
 * ]);
 * // -> weights 700_000 and 300_000
 * ```
 *
 * @throws {WeightError} if the list is empty, too long, holds a duplicate
 * payee, has a non-positive share, or gives someone a share so small it would
 * round down to a zero weight (which the contract rejects).
 */
export function recipientsFromShares(shares: readonly Share[]): Recipient[] {
  if (shares.length === 0) {
    throw new WeightError("a split needs at least one recipient");
  }
  if (shares.length > MAX_RECIPIENTS) {
    throw new WeightError(
      `a split holds at most ${MAX_RECIPIENTS} recipients, got ${shares.length}`,
    );
  }

  const seen = new Set<string>();
  for (const { payee } of shares) {
    const key = payeeKey(payee);
    if (seen.has(key)) {
      throw new WeightError(`duplicate recipient ${key}`);
    }
    seen.add(key);
  }

  // Scale to integers so the arithmetic below is exact, not floating point.
  const scaled = shares.map(({ share }, i) => {
    if (typeof share === "bigint") {
      if (share <= 0n) {
        throw new WeightError(`share ${i} must be positive, got ${share}`);
      }
      return share * 1_000_000n;
    }
    if (!Number.isFinite(share) || share <= 0) {
      throw new WeightError(`share ${i} must be a positive finite number, got ${share}`);
    }
    return BigInt(Math.round(share * 1_000_000));
  });

  const total = scaled.reduce((sum, s) => sum + s, 0n);
  const totalWeight = BigInt(TOTAL_WEIGHT);

  // Floor each weight, then hand the remainder to the largest fractional parts.
  const weights = scaled.map((s) => (s * totalWeight) / total);
  const remainders = scaled.map((s) => (s * totalWeight) % total);
  let leftover = totalWeight - weights.reduce((sum, w) => sum + w, 0n);

  const order = remainders
    .map((remainder, i) => ({ remainder, i }))
    .sort((a, b) => (a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1));

  for (const { i } of order) {
    if (leftover <= 0n) break;
    weights[i] += 1n;
    leftover -= 1n;
  }

  return shares.map(({ payee }, i) => {
    const weight = weights[i];
    if (weight === 0n) {
      throw new WeightError(
        `${payeeKey(payee)} rounds down to a zero weight: its share is under ` +
          `one millionth of the total, which the contract rejects`,
      );
    }
    return { payee, weight: Number(weight) };
  });
}

/**
 * An equal split between payees. Where the count does not divide 1,000,000 the
 * spare units go to the earliest payees, so three payees get 333,334 /
 * 333,333 / 333,333.
 */
export function evenSplit(payees: readonly Payee[]): Recipient[] {
  return recipientsFromShares(payees.map((payee) => ({ payee, share: 1 })));
}

/**
 * Check a recipient list against every rule the contract enforces, so a bad
 * list fails here instead of costing a transaction fee.
 *
 * @throws {WeightError} with the specific reason it would be rejected.
 */
export function assertValidRecipients(recipients: readonly Recipient[]): void {
  if (recipients.length === 0) {
    throw new WeightError("a split needs at least one recipient");
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new WeightError(
      `a split holds at most ${MAX_RECIPIENTS} recipients, got ${recipients.length}`,
    );
  }

  const seen = new Set<string>();
  let sum = 0;
  for (const { payee, weight } of recipients) {
    if (!Number.isInteger(weight) || weight <= 0) {
      throw new WeightError(
        `${payeeKey(payee)} has weight ${weight}: weights are positive whole numbers`,
      );
    }
    const key = payeeKey(payee);
    if (seen.has(key)) {
      throw new WeightError(`duplicate recipient ${key}`);
    }
    seen.add(key);
    sum += weight;
  }

  if (sum !== TOTAL_WEIGHT) {
    throw new WeightError(
      `weights add up to ${sum.toLocaleString("en-US")}, not ${TOTAL_WEIGHT.toLocaleString("en-US")}`,
    );
  }
}

/** What a weight is as a percentage, for display. */
export function weightToPercent(weight: number, fractionDigits = 4): string {
  return `${((weight / TOTAL_WEIGHT) * 100).toFixed(fractionDigits).replace(/\.?0+$/, "")}%`;
}
