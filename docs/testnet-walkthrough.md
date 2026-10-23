# Testnet walkthrough

Every command below was run against Stellar testnet on 23 October 2026 with `stellar-cli` 28.0.0 and
a contract built from this repository with `soroban-sdk` 28.0.0. The transaction hashes and fees are
the real ones, so you can open any of them in an explorer and check the numbers yourself.

The current deployment is
[`CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS`](https://lab.stellar.org/r/testnet/contract/CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS)
(Protocol 28, Wasm 14,256 bytes,
SHA-256 `04c54e379cf435601dbc8e5727d2a8da27a3c4175391758ef4a4f044cf7caf7a`). You can call it directly,
or deploy your own copy with the steps in [Deploy your own](#deploy-your-own).

The previous deployment,
[`CCNQHI3P…5POG`](https://lab.stellar.org/r/testnet/contract/CCNQHI3PBXFDMGOM32WAY5UB6WLPU2X4RLK6XF7FRRFAZ3GCHRVY5POG),
was built with `soroban-sdk` 27 and is still live. It is kept for the fee comparison at the end.

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
stellar contract invoke --id CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS --source-account splits-dev --network testnet -- \
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

Transaction: `69df2ef6c3a1a6d342736b6454f051da04e75e642b3107360ba19fb252a5e292`

## Deposit 10 XLM

```sh
stellar contract invoke --id CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS --source-account splits-dev --network testnet -- \
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

Transaction: `d3ecb50de1d43403407b79974c04d0805015e684d84da5098ae86bba2702d66b`

## Collect

Anyone can trigger a payout, and the tokens only ever go to the recipient itself, so each recipient
here pays their own transaction fee:

```sh
stellar contract invoke --id CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS --source-account splits-alice --network testnet -- \
  collect --split_id 0 --epoch 0 \
  --account "$(stellar keys address splits-alice)" \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Alice receives exactly 70,000,000 stroops (7 XLM) and bob 30,000,000 (3 XLM), with a matching
`Collected` event each.

Transactions: `bdf1d842e63e9e13…` (alice), `293779307cb9c85b…` (bob)

A second deposit of 1 XLM paid alice a further 7,000,000 stroops on her next `collect`
(`97dae6c1de6313f116feee9baf3e1921591bae0cc412d823ebca695bb425c11a`,
`064db7957613726b941d3548139fb387fea2cd42158dc8f2d63f2033741fedd4`).

Collecting again when nothing is owed returns `0`. The CLI recognises it as read-only and does not
even submit a transaction, so an over-eager keeper costs nobody anything.

## What it cost

Measured on 23 October 2026:

| Call | Fee charged |
|---|---:|
| `deploy` — upload Wasm | 9.7262 XLM |
| `deploy` — create instance | 0.0103 XLM |
| `create_split` (2 recipients) | 42.0231 XLM |
| `deposit`, first ever call | 41.9854 XLM |
| `collect`, alice's first | 42.0842 XLM |
| `collect`, bob's first | 32.3290 XLM |
| `deposit`, steady state | **0.0662 XLM** |
| `collect`, steady state | **0.2136 XLM** |

The first calls look alarming until you break one down. For the first deposit:

```
Inclusion fee:       100 stroops
Non-refundable:    8,290 stroops   (CPU, storage I/O, transaction size)
Refundable:  482,827,645 stroops   (storage rent, events, return value)
Charged:     419,845,920 stroops of refundable, 62,981,725 refunded
Fee charged: 419,854,310 stroops = 41.9854 XLM
```

**Over 99.99% is storage rent, not computation.** The contract's actual work costs 8,290 stroops,
about a thousandth of a cent. The rest buys storage lifetime: testnet's minimum is 7 days, so the
first calls top the contract, its code and each new entry up toward the 120-day target this contract
extends toward.

### Testnet rent is a moving target

The same operations cost roughly ten times less six weeks earlier:

| Call | 14 Sep 2026 | 23 Oct 2026 | Change |
|---|---:|---:|---:|
| `deposit`, first ever call | 4.0310 XLM | 41.9854 XLM | ×10.4 |
| `collect`, first | 4.0411 XLM | 42.0842 XLM | ×10.4 |
| `deposit`, steady state | 0.0088 XLM | 0.0662 XLM | ×7.5 |
| `collect`, steady state | 0.0242 XLM | 0.2136 XLM | ×8.8 |
| Non-refundable portion of a deposit | 16,701 stroops | 8,290 stroops | ×0.5 |

Compute got *cheaper*; rent got dramatically more expensive. Soroban's rent rate scales with how
full the network's state is relative to its target, and testnet's state has grown while its target
sits at 4 GB. Mainnet's parameters are unchanged (3 GB target, same floor and ceiling), and the
estimates in the [README](../README.md#costs) are measured at the floor rate.

The practical lesson for anyone budgeting a Soroban contract: **measure rent on the network you will
actually deploy to, on the day you deploy**, and treat testnet fee figures as a snapshot rather than
a forecast.

## Deploy your own

```sh
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/upstream.wasm \
  --source-account splits-dev --network testnet --alias upstream
```

The build is reproducible: each release publishes its Wasm together with a SHA-256, so you can check
that a deployment matches a tagged commit.

## Reading a split back

```sh
stellar contract invoke --id CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS --source-account splits-dev --network testnet -- \
  get_split --split_id 0
stellar contract invoke --id CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS --source-account splits-dev --network testnet -- \
  get_recipients --split_id 0 --epoch 0
stellar contract invoke --id CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS --source-account splits-dev --network testnet -- \
  claimable --split_id 0 --epoch 0 \
  --payee '{"Account":"GBC3FCQMVSXZZQPGYWSLXU5KEYAXLA3PDHBNOAGTK5NKA2JBA4TZSKO6"}' \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

These are read-only: the CLI answers them by simulation without submitting a transaction.
