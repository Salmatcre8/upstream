/**
 * TypeScript client for Upstream, weighted pull-based fund splits on Stellar.
 *
 * `Client` and the contract types come straight from the deployed contract's
 * own interface; everything else here exists to keep callers from paying a
 * transaction fee to learn that their weights were wrong.
 *
 * ```ts
 * import { Client, networks, account, recipientsFromShares, parseAmount } from "@upstream/sdk";
 *
 * const upstream = new Client({ ...networks.testnet, rpcUrl: "https://soroban-testnet.stellar.org" });
 *
 * // Read without signing anything.
 * const { result } = await upstream.get_split({ split_id: 0n });
 *
 * // Build weights that are guaranteed to add up to 1,000,000.
 * const recipients = recipientsFromShares([
 *   { payee: account(maintainer), share: 90 },
 *   { payee: account(contributor), share: 10 },
 * ]);
 * ```
 */
export * from "./bindings.js";
export {
  TOTAL_WEIGHT,
  MAX_RECIPIENTS,
  WeightError,
  account,
  nested,
  payeeKey,
  recipientsFromShares,
  evenSplit,
  assertValidRecipients,
  weightToPercent,
  type Share,
} from "./weights.js";
export {
  STROOP_DECIMALS,
  AmountError,
  parseAmount,
  formatAmount,
} from "./amounts.js";
