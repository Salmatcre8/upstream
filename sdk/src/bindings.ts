// GENERATED FILE — do not edit by hand.
//
// Regenerate with:
//
//   npm run regenerate            # from sdk/, against the deployed testnet contract
//
// or directly:
//
//   stellar contract bindings typescript \\
//     --contract-id CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS \\
//     --network testnet --output-dir <tmp>
//
// then copy <tmp>/src/index.ts over this file, keeping this header.

import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS",
  }
} as const

export const Errors = {
  1: {message:"SplitNotFound"},
  2: {message:"EpochNotFound"},
  3: {message:"NoRecipients"},
  4: {message:"TooManyRecipients"},
  5: {message:"ZeroWeight"},
  6: {message:"WeightsDoNotSumToTotal"},
  7: {message:"DuplicatePayee"},
  8: {message:"SelfReference"},
  9: {message:"Locked"},
  10: {message:"InvalidAmount"},
  11: {message:"NothingReceived"},
  12: {message:"NotARecipient"},
  13: {message:"Overflow"}
}

/**
 * Who receives a share of a split.
 */
export type Payee = {tag: "Account", values: readonly [string]} | {tag: "Split", values: readonly [u64]};



export interface Recipient {
  payee: Payee;
  /**
 * Share of the split in parts per million of [`TOTAL_WEIGHT`].
 */
weight: u32;
}


export interface SplitInfo {
  /**
 * The epoch new funds are credited to.
 */
epoch: u32;
  locked: boolean;
  owner: string;
}







export interface Client {
  /**
   * Construct and simulate a lock transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Permanently freeze a split's recipients.
   */
  lock: ({split_id}: {split_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a pull transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Move `child_id`'s share of `parent_id`'s `parent_epoch` into the child's
   * current epoch. Anyone may call it. Returns the amount moved (0 if none).
   */
  pull: ({parent_id, parent_epoch, child_id, token}: {parent_id: u64, parent_epoch: u32, child_id: u64, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a collect transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pay `account` its share of `split_id`'s `epoch`. Anyone may call it, and
   * funds only ever go to `account` itself. Returns the amount paid (0 if none).
   */
  collect: ({split_id, epoch, account, token}: {split_id: u64, epoch: u32, account: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposit up to `amount` of `token` from `from` into a split. Returns the
   * amount actually credited, measured as this contract's balance change so
   * tokens that take a fee on transfer are accounted correctly.
   */
  deposit: ({from, split_id, token, amount}: {from: string, split_id: u64, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a claimable transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Amount `payee` could settle right now from `(split_id, epoch)`.
   */
  claimable: ({split_id, epoch, payee, token}: {split_id: u64, epoch: u32, payee: Payee, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_split: ({split_id}: {split_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<SplitInfo>>

  /**
   * Construct and simulate a collect_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Like `collect`, but `account` authorizes paying to a destination of its
   * choice, e.g. a muxed exchange deposit address.
   */
  collect_to: ({split_id, epoch, account, token, to}: {split_id: u64, epoch: u32, account: string, token: string, to: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a create_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a split owned by `owner`. Returns its id.
   * 
   * When `locked` is true the recipients can never change.
   */
  create_split: ({owner, recipients, locked}: {owner: string, recipients: Array<Recipient>, locked: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_received transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Total amount of `token` ever credited to `(split_id, epoch)`.
   */
  get_received: ({split_id, epoch, token}: {split_id: u64, epoch: u32, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a next_split_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  next_split_id: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_recipients transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_recipients: ({split_id, epoch}: {split_id: u64, epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Recipient>>>

  /**
   * Construct and simulate a update_recipients transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace the recipients of an unlocked split. Starts a new epoch, which is
   * returned. Funds already credited stay with the previous epoch's recipients.
   */
  update_recipients: ({split_id, recipients}: {split_id: u64, recipients: Array<Recipient>}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a transfer_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Hand a split to a new owner. Both parties must authorize, so ownership can
   * never be sent to an address that cannot act on it.
   */
  transfer_ownership: ({split_id, new_owner}: {split_id: u64, new_owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADQAAAAAAAAANU3BsaXROb3RGb3VuZAAAAAAAAAEAAAAAAAAADUVwb2NoTm90Rm91bmQAAAAAAAACAAAAAAAAAAxOb1JlY2lwaWVudHMAAAADAAAAAAAAABFUb29NYW55UmVjaXBpZW50cwAAAAAAAAQAAAAAAAAAClplcm9XZWlnaHQAAAAAAAUAAAAAAAAAFldlaWdodHNEb05vdFN1bVRvVG90YWwAAAAAAAYAAAAAAAAADkR1cGxpY2F0ZVBheWVlAAAAAAAHAAAAAAAAAA1TZWxmUmVmZXJlbmNlAAAAAAAACAAAAAAAAAAGTG9ja2VkAAAAAAAJAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACgAAAAAAAAAPTm90aGluZ1JlY2VpdmVkAAAAAAsAAAAAAAAADU5vdEFSZWNpcGllbnQAAAAAAAAMAAAAAAAAAAhPdmVyZmxvdwAAAA0=",
        "AAAAAgAAACBXaG8gcmVjZWl2ZXMgYSBzaGFyZSBvZiBhIHNwbGl0LgAAAAAAAAAFUGF5ZWUAAAAAAAACAAAAAQAAAERBbiBhY2NvdW50IG9yIGNvbnRyYWN0IGFkZHJlc3MsIHNldHRsZWQgd2l0aCBgY29sbGVjdGAvYGNvbGxlY3RfdG9gLgAAAAdBY2NvdW50AAAAAAEAAAATAAAAAQAAADRBbm90aGVyIHNwbGl0IGluIHRoaXMgY29udHJhY3QsIHNldHRsZWQgd2l0aCBgcHVsbGAuAAAABVNwbGl0AAAAAAAAAQAAAAY=",
        "AAAAAAAAAChQZXJtYW5lbnRseSBmcmVlemUgYSBzcGxpdCdzIHJlY2lwaWVudHMuAAAABGxvY2sAAAABAAAAAAAAAAhzcGxpdF9pZAAAAAYAAAAA",
        "AAAAAAAAAJFNb3ZlIGBjaGlsZF9pZGAncyBzaGFyZSBvZiBgcGFyZW50X2lkYCdzIGBwYXJlbnRfZXBvY2hgIGludG8gdGhlIGNoaWxkJ3MKY3VycmVudCBlcG9jaC4gQW55b25lIG1heSBjYWxsIGl0LiBSZXR1cm5zIHRoZSBhbW91bnQgbW92ZWQgKDAgaWYgbm9uZSkuAAAAAAAABHB1bGwAAAAEAAAAAAAAAAlwYXJlbnRfaWQAAAAAAAAGAAAAAAAAAAxwYXJlbnRfZXBvY2gAAAAEAAAAAAAAAAhjaGlsZF9pZAAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL",
        "AAAABQAAAAAAAAAAAAAABlB1bGxlZAAAAAAAAQAAAAZwdWxsZWQAAAAAAAYAAAAAAAAACHNwbGl0X2lkAAAABgAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAAAAAACXBhcmVudF9pZAAAAAAAAAYAAAAAAAAAAAAAAAxwYXJlbnRfZXBvY2gAAAAEAAAAAAAAAAAAAAAFZXBvY2gAAAAAAAAEAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAAAQAAAAAAAAAAAAAACVJlY2lwaWVudAAAAAAAAAIAAAAAAAAABXBheWVlAAAAAAAH0AAAAAVQYXllZQAAAAAAADxTaGFyZSBvZiB0aGUgc3BsaXQgaW4gcGFydHMgcGVyIG1pbGxpb24gb2YgW2BUT1RBTF9XRUlHSFRgXS4AAAAGd2VpZ2h0AAAAAAAE",
        "AAAAAQAAAAAAAAAAAAAACVNwbGl0SW5mbwAAAAAAAAMAAAAkVGhlIGVwb2NoIG5ldyBmdW5kcyBhcmUgY3JlZGl0ZWQgdG8uAAAABWVwb2NoAAAAAAAABAAAAAAAAAAGbG9ja2VkAAAAAAABAAAAAAAAAAVvd25lcgAAAAAAABM=",
        "AAAAAAAAAJVQYXkgYGFjY291bnRgIGl0cyBzaGFyZSBvZiBgc3BsaXRfaWRgJ3MgYGVwb2NoYC4gQW55b25lIG1heSBjYWxsIGl0LCBhbmQKZnVuZHMgb25seSBldmVyIGdvIHRvIGBhY2NvdW50YCBpdHNlbGYuIFJldHVybnMgdGhlIGFtb3VudCBwYWlkICgwIGlmIG5vbmUpLgAAAAAAAAdjb2xsZWN0AAAAAAQAAAAAAAAACHNwbGl0X2lkAAAABgAAAAAAAAAFZXBvY2gAAAAAAAAEAAAAAAAAAAdhY2NvdW50AAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAMtEZXBvc2l0IHVwIHRvIGBhbW91bnRgIG9mIGB0b2tlbmAgZnJvbSBgZnJvbWAgaW50byBhIHNwbGl0LiBSZXR1cm5zIHRoZQphbW91bnQgYWN0dWFsbHkgY3JlZGl0ZWQsIG1lYXN1cmVkIGFzIHRoaXMgY29udHJhY3QncyBiYWxhbmNlIGNoYW5nZSBzbwp0b2tlbnMgdGhhdCB0YWtlIGEgZmVlIG9uIHRyYW5zZmVyIGFyZSBhY2NvdW50ZWQgY29ycmVjdGx5LgAAAAAHZGVwb3NpdAAAAAAEAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAIc3BsaXRfaWQAAAAGAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAAL",
        "AAAABQAAAAAAAAAAAAAACUNvbGxlY3RlZAAAAAAAAAEAAAAJY29sbGVjdGVkAAAAAAAABQAAAAAAAAAIc3BsaXRfaWQAAAAGAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAAAAAAAAAAAFZXBvY2gAAAAAAAAEAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACURlcG9zaXRlZAAAAAAAAAEAAAAJZGVwb3NpdGVkAAAAAAAABQAAAAAAAAAIc3BsaXRfaWQAAAAGAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAD9BbW91bnQgYHBheWVlYCBjb3VsZCBzZXR0bGUgcmlnaHQgbm93IGZyb20gYChzcGxpdF9pZCwgZXBvY2gpYC4AAAAACWNsYWltYWJsZQAAAAAAAAQAAAAAAAAACHNwbGl0X2lkAAAABgAAAAAAAAAFZXBvY2gAAAAAAAAEAAAAAAAAAAVwYXllZQAAAAAAB9AAAAAFUGF5ZWUAAAAAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAJZ2V0X3NwbGl0AAAAAAAAAQAAAAAAAAAIc3BsaXRfaWQAAAAGAAAAAQAAB9AAAAAJU3BsaXRJbmZvAAAA",
        "AAAABQAAAAAAAAAAAAAAC1NwbGl0TG9ja2VkAAAAAAEAAAAMc3BsaXRfbG9ja2VkAAAAAQAAAAAAAAAIc3BsaXRfaWQAAAAGAAAAAQAAAAI=",
        "AAAAAAAAAHZMaWtlIGBjb2xsZWN0YCwgYnV0IGBhY2NvdW50YCBhdXRob3JpemVzIHBheWluZyB0byBhIGRlc3RpbmF0aW9uIG9mIGl0cwpjaG9pY2UsIGUuZy4gYSBtdXhlZCBleGNoYW5nZSBkZXBvc2l0IGFkZHJlc3MuAAAAAAAKY29sbGVjdF90bwAAAAAABQAAAAAAAAAIc3BsaXRfaWQAAAAGAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAAAAAAAB2FjY291bnQAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAJ0bwAAAAAAFAAAAAEAAAAL",
        "AAAABQAAAAAAAAAAAAAADFNwbGl0Q3JlYXRlZAAAAAEAAAANc3BsaXRfY3JlYXRlZAAAAAAAAAQAAAAAAAAACHNwbGl0X2lkAAAABgAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAAAAAABmxvY2tlZAAAAAAAAQAAAAAAAAAAAAAACnJlY2lwaWVudHMAAAAAAAQAAAAAAAAAAg==",
        "AAAAAAAAAGhDcmVhdGUgYSBzcGxpdCBvd25lZCBieSBgb3duZXJgLiBSZXR1cm5zIGl0cyBpZC4KCldoZW4gYGxvY2tlZGAgaXMgdHJ1ZSB0aGUgcmVjaXBpZW50cyBjYW4gbmV2ZXIgY2hhbmdlLgAAAAxjcmVhdGVfc3BsaXQAAAADAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAACnJlY2lwaWVudHMAAAAAA+oAAAfQAAAACVJlY2lwaWVudAAAAAAAAAAAAAAGbG9ja2VkAAAAAAABAAAAAQAAAAY=",
        "AAAAAAAAAD1Ub3RhbCBhbW91bnQgb2YgYHRva2VuYCBldmVyIGNyZWRpdGVkIHRvIGAoc3BsaXRfaWQsIGVwb2NoKWAuAAAAAAAADGdldF9yZWNlaXZlZAAAAAMAAAAAAAAACHNwbGl0X2lkAAAABgAAAAAAAAAFZXBvY2gAAAAAAAAEAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAACw==",
        "AAAAAAAAAAAAAAANbmV4dF9zcGxpdF9pZAAAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAAAAAAAAOZ2V0X3JlY2lwaWVudHMAAAAAAAIAAAAAAAAACHNwbGl0X2lkAAAABgAAAAAAAAAFZXBvY2gAAAAAAAAEAAAAAQAAA+oAAAfQAAAACVJlY2lwaWVudAAAAA==",
        "AAAABQAAAAAAAAAAAAAAEVJlY2lwaWVudHNVcGRhdGVkAAAAAAAAAQAAABJyZWNpcGllbnRzX3VwZGF0ZWQAAAAAAAMAAAAAAAAACHNwbGl0X2lkAAAABgAAAAEAAAAAAAAABWVwb2NoAAAAAAAABAAAAAAAAAAAAAAACnJlY2lwaWVudHMAAAAAAAQAAAAAAAAAAg==",
        "AAAAAAAAAJVSZXBsYWNlIHRoZSByZWNpcGllbnRzIG9mIGFuIHVubG9ja2VkIHNwbGl0LiBTdGFydHMgYSBuZXcgZXBvY2gsIHdoaWNoIGlzCnJldHVybmVkLiBGdW5kcyBhbHJlYWR5IGNyZWRpdGVkIHN0YXkgd2l0aCB0aGUgcHJldmlvdXMgZXBvY2gncyByZWNpcGllbnRzLgAAAAAAABF1cGRhdGVfcmVjaXBpZW50cwAAAAAAAAIAAAAAAAAACHNwbGl0X2lkAAAABgAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAB9AAAAAJUmVjaXBpZW50AAAAAAAAAQAAAAQ=",
        "AAAAAAAAAH1IYW5kIGEgc3BsaXQgdG8gYSBuZXcgb3duZXIuIEJvdGggcGFydGllcyBtdXN0IGF1dGhvcml6ZSwgc28gb3duZXJzaGlwIGNhbgpuZXZlciBiZSBzZW50IHRvIGFuIGFkZHJlc3MgdGhhdCBjYW5ub3QgYWN0IG9uIGl0LgAAAAAAABJ0cmFuc2Zlcl9vd25lcnNoaXAAAAAAAAIAAAAAAAAACHNwbGl0X2lkAAAABgAAAAAAAAAJbmV3X293bmVyAAAAAAAAEwAAAAA=",
        "AAAABQAAAAAAAAAAAAAAFE93bmVyc2hpcFRyYW5zZmVycmVkAAAAAQAAABVvd25lcnNoaXBfdHJhbnNmZXJyZWQAAAAAAAADAAAAAAAAAAhzcGxpdF9pZAAAAAYAAAABAAAAAAAAAA5wcmV2aW91c19vd25lcgAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    lock: this.txFromJSON<null>,
        pull: this.txFromJSON<i128>,
        collect: this.txFromJSON<i128>,
        deposit: this.txFromJSON<i128>,
        claimable: this.txFromJSON<i128>,
        get_split: this.txFromJSON<SplitInfo>,
        collect_to: this.txFromJSON<i128>,
        create_split: this.txFromJSON<u64>,
        get_received: this.txFromJSON<i128>,
        next_split_id: this.txFromJSON<u64>,
        get_recipients: this.txFromJSON<Array<Recipient>>,
        update_recipients: this.txFromJSON<u32>,
        transfer_ownership: this.txFromJSON<null>
  }
}