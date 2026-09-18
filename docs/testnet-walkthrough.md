# Testnet walkthrough

Every command below was run against Stellar testnet on 14 September 2026 with `stellar-cli` 28.0.0
and the contract built from this repository. The transaction hashes and fees are the real ones, so
you can open any of them in an explorer and check the numbers yourself.

The deployed contract is
[`CCNQHI3PBXFDMGOM32WAY5UB6WLPU2X4RLK6XF7FRRFAZ3GCHRVY5POG`](https://lab.stellar.org/r/testnet/contract/CCNQHI3PBXFDMGOM32WAY5UB6WLPU2X4RLK6XF7FRRFAZ3GCHRVY5POG).
You can call it directly, or deploy your own copy with the steps in [Deploy your own](#deploy-your-own).

## Prerequisites

- [Rust](https://rustup.rs) — the toolchain pinned in `rust-toolchain.toml` installs itself
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli) 28.0.0 or newer

Amounts are in **stroops**: 1 XLM = 10,000,000 stroops. Weights are in **parts per million** and must
add up to exactly 1,000,000.

## Identities

```sh
stellar keys generate splits-dev   --network testnet --fund
stellar keys generate splits-alice --network testnet --fund
stellar keys generate splits-bob   --network testnet --fund
```

`--fund` asks friendbot for test XLM. Because the split below pays XLM, and every account holds XLM
natively, no trustlines are needed.

## The XLM token contract

Deposits and payouts go through a token contract. For native XLM on testnet:

```sh
stellar contract id asset --asset native --network testnet
# CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

## Create a split

Alice takes 70%, bob 30%. The split is left unlocked so the owner could still change recipients,
which would start a new epoch.

```sh
stellar contract invoke --id CCNQHI3PBXFDMGOM32WAY5UB6WLPU2X4RLK6XF7FRRFAZ3GCHRVY5POG --source-account splits-dev --network testnet -- \
  create_split \
  --owner "$(stellar keys address splits-dev)" \
  --recipients '[{"payee":{"Account":"GBMDBJHWHLPYYO2LQH3W2WZYVB76HJFA2IS5AGPCPOH4NWMWYYKKOUBJ"},"weight":700000},
                 {"payee":{"Account":"GBC3FCQMVSXZZQPGYWSLXU5KEYAXLA3PDHBNOAGTK5NKA2JBA4TZSKO6"},"weight":300000}]' \
  --locked false
```

Returns the split id (`0` for the first split created by a deployment) and emits:

```
SplitCreated (split_created), split_id: 0, owner: "GDWNGXL6…", locked: false, recipients: 2
```

Transaction: `169175e8c06eb7f677d6053e532d52859038ad537b0e7426f6786a2ad9103f70`

## Deposit 10 XLM

```sh
stellar contract invoke --id CCNQHI3PBXFDMGOM32WAY5UB6WLPU2X4RLK6XF7FRRFAZ3GCHRVY5POG --source-account splits-dev --network testnet -- \
  deposit \
  --from "$(stellar keys address splits-dev)" \
  --split_id 0 \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --amount 100000000
```

Two events are emitted: the token's own `transfer`, and the contract's

```
Deposited (deposited), split_id: 0, token: "CDLZFC3S…", from: "GDWNGXL6…", epoch: 0, amount: "100000000"
```

The call returns the amount actually credited (`100000000`), measured as the contract's balance
change rather than the amount requested.

Transaction: `a13c5ed5e60c80d24f2641e5918adbe0f6c693c4e63e325623d193d409fd8346`

## Collect

Anyone can trigger a payout, and the tokens only ever go to the recipient itself, so each recipient
here pays their own transaction fee:

```sh
stellar contract invoke --id CCNQHI3PBXFDMGOM32WAY5UB6WLPU2X4RLK6XF7FRRFAZ3GCHRVY5POG --source-account splits-alice --network testnet -- \
  collect --split_id 0 --epoch 0 \
  --account "$(stellar keys address splits-alice)" \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Alice receives exactly 70,000,000 stroops (7 XLM) and bob 30,000,000 (3 XLM), with a matching
`Collected` event each.

Transactions: `57255904fa45a701ed0a1b957006c56a8fcf4efb2c1fd972435b1c4d9b5f8309` (alice),
`5d9878f0c434e07b15be53d8dc057fcca246472c746f7dd7c7e3105cc409aae3` (bob)

A second deposit of 1 XLM paid alice a further 7,000,000 stroops on her next `collect`
(`cd41d4d660c9cc854c25b70e0958292275c0aae0f60968f6dbdcbe14fcd6ec77`,
`2d4c7c14c1fc236a1ea585ac015c63bf4dbe2dc68983e309ef7238e69abd5aee`). Nothing is owed until a
deposit arrives, and a repeated `collect` pays 0 rather than failing.

## What it cost

| Call | Fee charged |
|---|---:|
| `create_split` (2 recipients) | 4.0344 XLM |
| `deposit`, first ever call | 4.0310 XLM |
| `collect`, alice's first | 4.0411 XLM |
| `collect`, bob's first | 3.1056 XLM |
| `deposit`, steady state | **0.0088 XLM** |
| `collect`, steady state | **0.0242 XLM** |

The first calls look alarming until you break one down. For the first deposit:

```
Inclusion fee:      100 stroops
Non-refundable:  16,701 stroops   (CPU, storage I/O, transaction size)
Refundable:  40,293,427 stroops   (storage rent, events, return value)
Refunded:     6,053,694 stroops
Fee charged: 40,310,228 stroops = 4.0310 XLM
```

Over 99.9% of it is **storage rent**, not computation. Testnet's minimum storage lifetime is 7 days,
so the first calls top the contract, its code and each new entry up toward the 120-day target that
this contract extends toward. Once everything is topped up, the same deposit costs 88,290 stroops.

Mainnet behaves differently: persistent entries there start at the 120-day minimum, so these
top-ups become small daily extensions instead of one large payment. See the cost table in the
[README](../README.md#costs) for estimated mainnet fees per call.

## Deploy your own

```sh
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/upstream.wasm \
  --source-account splits-dev --network testnet --alias upstream
```

The build is reproducible: release `v0.1.0` publishes the same Wasm together with its SHA-256, so
you can check that a deployment matches a tagged commit.

## Reading a split back

```sh
stellar contract invoke --id CCNQHI3PBXFDMGOM32WAY5UB6WLPU2X4RLK6XF7FRRFAZ3GCHRVY5POG --source-account splits-dev --network testnet -- \
  get_split --split_id 0
stellar contract invoke --id CCNQHI3PBXFDMGOM32WAY5UB6WLPU2X4RLK6XF7FRRFAZ3GCHRVY5POG --source-account splits-dev --network testnet -- \
  get_recipients --split_id 0 --epoch 0
stellar contract invoke --id CCNQHI3PBXFDMGOM32WAY5UB6WLPU2X4RLK6XF7FRRFAZ3GCHRVY5POG --source-account splits-dev --network testnet -- \
  claimable --split_id 0 --epoch 0 \
  --payee '{"Account":"GBC3FCQMVSXZZQPGYWSLXU5KEYAXLA3PDHBNOAGTK5NKA2JBA4TZSKO6"}' \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

These are read-only, so they cost nothing beyond the transaction fee, and simulation alone answers
them if you only want the value.
