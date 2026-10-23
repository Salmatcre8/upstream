# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `docs/testnet-walkthrough.md`: the commands, transaction hashes and fees from the live testnet
  run, with a breakdown of why the first calls cost storage rent.
- Fee comparison between the September and October testnet runs, showing rent rising about tenfold
  while compute got cheaper, and what that means for budgeting a Soroban contract.

### Changed

- Redeployed to Stellar testnet under Protocol 28, built with `soroban-sdk` 28:
  [`CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS`](https://lab.stellar.org/r/testnet/contract/CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS).
  The end-to-end flow was re-verified: a 70/30 split paid exactly 7 and 3 XLM from a 10 XLM deposit,
  a second deposit paid 0.7 XLM, and collecting with nothing owed returns 0 without submitting a
  transaction. Wasm is 14,256 bytes, SHA-256
  `04c54e379cf435601dbc8e5727d2a8da27a3c4175391758ef4a4f044cf7caf7a`.
- README and landing page updated with the new address, toolchain version, Wasm size and measured
  fees.

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
