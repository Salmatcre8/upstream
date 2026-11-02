# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `sdk/`: a TypeScript client. Generated bindings for every entrypoint, plus the helpers
  that keep callers out of trouble: `recipientsFromShares` turns shares in any units into
  ppm weights that add up to exactly 1,000,000 (largest remainder, computed in `BigInt`),
  `assertValidRecipients` applies the contract's own rules client-side, and
  `parseAmount`/`formatAmount` convert decimal text to base units without floating point.
  20 unit tests, a runnable example that reads the live testnet split, and a CI job that
  fails if the vendored bindings drift from the contract's interface.

- `docs/testnet-walkthrough.md`: the commands, transaction hashes and fees from the live testnet
  run, with a breakdown of why the first calls cost storage rent.

## [0.1.0] - 2026-09-17

First public pre-release. The contract is unaudited and deployed on Stellar testnet only.

### Added

- Splits contract: `create_split`, `update_recipients` with epochs, `lock`, `transfer_ownership`,
  `deposit`, `pull`, `collect`, `collect_to` and read-only views.
- Weighted recipients in parts per million (up to 50 per split), where a recipient is an account or
  another split.
- Pull-based settlement with cumulative rounding: at most one base unit lost per recipient per
  epoch.
- Deposits credited by measured balance change, supporting fee-on-transfer tokens.
- Bounded storage TTL extension and contract events for indexing.
- Unit tests under mainnet resource limits and an opt-in cost report.
- Community files: contribution guide, code of conduct, security policy, issue and pull request
  templates, code owners.
- CI for formatting, clippy, tests, Wasm build with size check, and a cargo-deny dependency audit;
  Dependabot for Cargo and GitHub Actions.
- Static landing page in `site/`, with web-sized icons and logo.

### Security

- The dependency audit ignores RUSTSEC-2024-0436 (`paste` is unmaintained). It is a compile-time
  dependency of `soroban-sdk` with no upgrade available and ships no code in the contract.

[Unreleased]: https://github.com/Salmatcre8/upstream/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Salmatcre8/upstream/releases/tag/v0.1.0
