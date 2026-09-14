# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Salmatcre8/upstream/commits/main
