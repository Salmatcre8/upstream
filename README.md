# Upstream

[![CI](https://github.com/Salmatcre8/upstream/actions/workflows/ci.yml/badge.svg)](https://github.com/Salmatcre8/upstream/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Status: testnet, unaudited](https://img.shields.io/badge/status-testnet%20%C2%B7%20unaudited-orange)

**Fund your dependencies on-chain.** Weighted, nestable, pull-based fund splits for Stellar.

A **split** routes everything it receives to a weighted list of recipients. A recipient is an
account (`G...` or `C...`) or **another split**, so projects can build dependency trees: an app
routes 10% of its income to a split of its open-source dependencies, which routes a share to
*their* dependencies.

The goal is payout rails for dependency-weighted public-goods funding on Stellar: weights can come
from a dependency graph (e.g. [PG Atlas](https://scf-public-goods-maintenance.github.io/pg-atlas)),
and any income stream (grant tranches, bounty pools, revenue, x402 payments) can be routed through
a split.

> Status: pre-audit MVP on `soroban-sdk` 28, deployed on Stellar testnet as
> [`CAZLMMGS…RGBS`](https://lab.stellar.org/r/testnet/contract/CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS).
> Not deployed to mainnet. Do not use with real funds.
>
> The project landing page lives in [`site/`](site): static HTML, CSS and JavaScript with no build step.

## Why another splitter?

Earlier Soroban splitters are admin-triggered, push funds to every recipient, or are no longer
maintained. This contract is designed around Soroban's constraints instead:

| | Upstream |
|---|---|
| Who triggers payouts | Anyone (`collect`, `pull` are permissionless) |
| Cost of a deposit | O(1), independent of recipient count |
| One bad recipient (missing trustline, frozen balance, archived entry) | Only affects itself: nothing is pushed in bulk |
| Changing recipients | Starts a new epoch; money already received can never be redirected |
| Permanence | `lock` makes recipients immutable |
| Nesting | Recipients can be splits; funds move one hop per `pull` |
| Fee-on-transfer / misreporting tokens | Credits the measured balance change, capped at the requested amount |
| Rounding | Cumulative settlement: at most 1 base unit lost per recipient per epoch |
| License | Apache-2.0 |

## How it works

```
funder ──deposit──▶ split #1 (epoch 0)
                     ├─ 90% maintainer  ──collect──▶ maintainer
                     └─ 10% split #0 ────pull─────▶ split #0 (epoch 0)
                                                     ├─ 60% lib-one ──collect──▶ lib-one
                                                     └─ 40% lib-two ──collect──▶ lib-two
```

- Weights are parts per million and must sum to exactly `1_000_000`. Max 50 recipients per split.
- Each `(split, epoch, token)` tracks `acc`, the total ever credited. A recipient with weight `w`
  is owed `floor(w * acc / 1_000_000)` over the epoch's lifetime; each settlement pays the
  difference against its stored checkpoint.
- `update_recipients` starts a new epoch. Deposits always credit the current epoch; past epochs
  remain claimable forever by their recipients.
- All tokens are held by this single contract with per-split, per-epoch, per-token accounting, so a
  misbehaving token can only affect its own balances.
- Touched storage entries have their TTL extended (towards 120 days, at most 30 days per call), so
  no caller pays unbounded rent. Entries idle for longer archive and are restored automatically by
  the next transaction that touches them.

## Costs

Estimated mainnet fees per call, measured with `cargo test cost_report -- --ignored --nocapture`
using mainnet TTL settings and the live rent rate (1,000 stroops/KB; the SDK estimator's 12,000 is a
deliberate overestimate). These come from the native test host and exclude Wasm VM costs, so treat
them as lower-bound estimates until confirmed by testnet simulation.

| Call | CPU instructions | Writes | Est. fee |
|---|---:|---:|---:|
| `create_split` (50 recipients, prepays 120 days of rent) | ~1.96M | 4 | ~1.06 XLM |
| `deposit` (first per token) | ~0.38M | 4 | ~0.075 XLM |
| `deposit` (subsequent) | ~0.41M | 4 | ~0.011 XLM |
| `collect` (first time, creates checkpoint) | ~0.50M | 3 | ~0.078 XLM |
| `pull` (nested split) | ~0.31M | 2 | ~0.062 XLM |
| `update_recipients` (50 recipients) | ~1.98M | 3 | ~1.03 XLM |

All calls use well under 1% of the 400M instruction and 200 write-entry per-transaction limits.
Rent dominates: a split's recipient list costs about 0.17 XLM per KB per 120 days.

### Testnet verification (2026-10-23)

Deployed on testnet (Protocol 28, `stellar-cli` 28.0.0) as
[`CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS`](https://lab.stellar.org/r/testnet/contract/CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS)
(optimized Wasm: 14,256 bytes). A 70/30 split received 10 XLM and 1 XLM deposits; both recipients
collected exactly 7 + 0.7 XLM and 3 XLM.

| Call | Fee charged |
|---|---:|
| `deposit` (steady state) | 0.0662 XLM |
| `collect` (steady state) | 0.2136 XLM |
| First calls on a fresh deployment (`create_split`, first `deposit`, first `collect`s) | 32-42 XLM each |

The first-call fees are almost entirely storage rent (e.g. the first deposit: 40.29M stroops
refundable rent vs 16.7K stroops CPU/IO). Testnet's minimum persistent TTL is 7 days, so early calls
top the contract instance, Wasm code and new entries up towards the 120-day target in 30-day steps.
On mainnet, entries start at the 120-day minimum, so these top-ups are small daily extensions
instead.

## Contract interface

| Function | Auth | Description |
|---|---|---|
| `create_split(owner, recipients, locked) -> u64` | owner | Create a split |
| `update_recipients(split_id, recipients) -> u32` | owner | New recipients, new epoch (fails if locked) |
| `lock(split_id)` | owner | Make recipients permanent |
| `transfer_ownership(split_id, new_owner)` | owner + new owner | Change owner |
| `deposit(from, split_id, token, amount) -> i128` | from | Fund a split; returns amount credited |
| `pull(parent_id, parent_epoch, child_id, token) -> i128` | none | Move a nested split's share into it |
| `collect(split_id, epoch, account, token) -> i128` | none | Pay an account its share, to itself |
| `collect_to(split_id, epoch, account, token, to) -> i128` | account | Pay to any (muxed) address |
| `claimable(split_id, epoch, payee, token) -> i128` | none | Amount settleable now |
| `get_split`, `get_recipients`, `get_received`, `next_split_id` | none | Views |

Events (`#[contractevent]`): `split_created`, `recipients_updated`, `split_locked`,
`ownership_transferred`, `deposited`, `pulled`, `collected`. Split id (and token where relevant)
are topics for indexing.

## Development

Requires [Rust](https://rustup.rs) (the toolchain pinned in `rust-toolchain.toml`, including the `wasm32v1-none` target, installs automatically) and [Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli) 28.0.0 or newer. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

To call the deployed contract yourself, follow the
[testnet walkthrough](docs/testnet-walkthrough.md): every command, transaction hash and fee from the
live run, including why the first calls cost tens of XLM in storage rent while the ones after cost a fraction of one.

```sh
cargo test                     # unit tests (mainnet resource limits enforced)
stellar contract build         # builds target/wasm32v1-none/release/upstream.wasm
```

## Roadmap

Mapped to SCF Build Award milestones.

**MVP**
- [x] Core splits contract: create, update (epochs), lock, ownership, deposit, pull, collect
- [x] Unit tests incl. rounding, auth, nesting, token isolation, max-size split under network limits
- [x] Testnet deployment and end-to-end verification
- [ ] TypeScript bindings/SDK
- [ ] Fuzz / property tests for accounting invariants

**Testnet**
- [ ] Repo payees: fund a GitHub repo before its maintainer claims it, with a refund deadline and a
      swappable attestation verifier
- [ ] PG Atlas weight import: generate dependency splits from the dependency graph
- [ ] Per-split deposit addresses so plain payments (e.g. x402 `payTo`) route into a split
- [ ] Indexer + dashboard for splits, flows and claimable balances

**Mainnet**
- [ ] Audit via the Soroban Audit Bank
- [ ] Mainnet deployment, docs, monitoring
- [ ] Streams on top of splits

## Contributing

Contributions are welcome: tests, the TypeScript SDK, and the roadmap features above. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and look for issues labeled `good first issue`. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Upstream is unaudited. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), never in a public issue.

## License

Apache-2.0. See [LICENSE](LICENSE). Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).
