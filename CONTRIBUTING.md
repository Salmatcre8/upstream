# Contributing to Upstream

Thanks for helping fund open source on Stellar. Upstream is a Soroban smart contract that routes a
project's income to its contributors and dependencies, so correctness matters more than speed. This
guide explains how to get set up and what we look for in a contribution.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- Pick up an issue labeled [`good first issue`](https://github.com/Salmatcre8/upstream/labels/good%20first%20issue)
  or [`help wanted`](https://github.com/Salmatcre8/upstream/labels/help%20wanted)
- Add tests, especially for edge cases in the accounting
- Work on a roadmap item from the [README](README.md#roadmap): TypeScript SDK, repository payees,
  PG Atlas weight import, deposit addresses, indexer and dashboard
- Improve documentation and examples
- Report bugs with the issue form

Security vulnerabilities are the exception: never open a public issue. Follow [SECURITY.md](SECURITY.md).

## Before you start

- **Comment on the issue first** so work isn't duplicated. For anything larger than a small fix,
  describe your approach and wait for a maintainer to agree before writing code.
- **One assignee per issue.** A pull request for an issue assigned to someone else won't be merged.
- **Drips Wave and GrantFox.** Some issues are funded through [Drips Wave](https://www.drips.network/wave)
  or [GrantFox](https://grantfox.xyz). Apply through the platform the issue is listed on, and only
  start once you are assigned. Rewards follow that platform's rules.
- **AI-assisted code is fine, unreviewed code is not.** You are responsible for every line you
  submit: understand it, test it, and be ready to explain it in review. Low-effort generated pull
  requests will be closed.

## Development setup

Prerequisites:

- [Rust](https://rustup.rs). The pinned toolchain in `rust-toolchain.toml` (Rust 1.94.0 with the
  `wasm32v1-none` target, rustfmt and clippy) installs automatically on first build.
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli) 28.0.0 or newer, to build
  the contract Wasm and deploy to testnet.

```sh
git clone https://github.com/Salmatcre8/upstream.git
cd upstream
cargo test
```

## Commands

| Command | What it does |
|---|---|
| `cargo fmt --all` | Formats the code |
| `cargo clippy --all-targets -- -D warnings` | Lints; CI fails on any warning |
| `cargo test` | Runs the unit tests with mainnet resource limits enforced |
| `cargo test cost_report -- --ignored --nocapture` | Prints resource and fee estimates for each entrypoint |
| `stellar contract build` | Builds `target/wasm32v1-none/release/upstream.wasm` |

CI runs formatting, clippy, tests, the Wasm build with a size check, and a dependency audit on every
pull request. Run the first three locally before pushing.

## Project layout

```
contracts/upstream/src/lib.rs    Contract: types, storage, entrypoints, events
contracts/upstream/src/test.rs   Unit tests and the cost report
.github/                         CI workflows, issue and pull request templates
```

## Contract guidelines

Upstream's value comes from a few invariants. Every change must preserve them, and a pull request
that touches accounting should say how it does:

1. **Recipients are never paid more than a split received.**
2. **Funds credited to an epoch are only ever paid to that epoch's recipients.**
3. **One recipient's failure never blocks another recipient.** Nothing pushes funds to a list of
   recipients in a single call.
4. **Deposits cost the same regardless of recipient count.**
5. **No privileged roles.** Don't add admin keys, fees, pausing or upgradeability without an
   agreed design issue.

In practice:

- Every behaviour change needs unit tests, including the failure cases.
- Use checked arithmetic and return contract errors with `panic_with_error!`, never bare `unwrap`
  or `panic!` on user input.
- Update state before calling token contracts.
- Keep storage bounded. Changes to storage keys, stored types or events break indexers and existing
  deployments; call them out in the pull request and the changelog.
- If a change affects cost, include before and after numbers from the cost report.

## Commits and pull requests

- Write commit messages in [Conventional Commits](https://www.conventionalcommits.org) style, for
  example `feat: add claim deadline to repository payees` or `fix: reject zero-amount pulls`.
- Keep pull requests focused on one change. Fill in the template, link the issue, and make sure CI
  is green.
- Add an entry under `Unreleased` in [CHANGELOG.md](CHANGELOG.md) for user-facing changes.
- A maintainer reviews every pull request. Expect questions about invariants and tests; that is
  normal for contract code. Pull requests are squash-merged.

## License

Upstream is licensed under [Apache-2.0](LICENSE). Under section 5 of that license, any contribution
you intentionally submit is licensed under the same terms. No separate contributor agreement is
required.
