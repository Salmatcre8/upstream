# Security Policy

Upstream holds and routes funds, so we treat security reports as our highest priority.

## Status

Upstream is **unaudited** and deployed on **Stellar testnet only**. Do not use it with real funds. An
independent audit through the Soroban Audit Bank is planned before any mainnet deployment.

## Supported versions

| Version | Supported |
|---|---|
| `main` branch | Yes |
| Tagged releases | The latest release, once releases exist |

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a vulnerability.**

Report it privately through GitHub:
[Report a vulnerability](https://github.com/Salmatcre8/upstream/security/advisories/new).

If you cannot use GitHub, email **abdullahiummusalmat@gmail.com** with the subject
`[upstream security]`.

Please include:

- The affected function or file, and the commit you tested
- The impact: what an attacker gains, or what funds are lost, locked or redirected
- Steps to reproduce, ideally as a failing unit test
- Any suggested fix

## What happens next

| Step | Target |
|---|---|
| Acknowledge your report | 3 business days |
| Confirm and assess severity | 7 days |
| Fix critical and high severity issues | 30 days |
| Fix medium severity issues | 60 days |

We will keep you updated, agree a disclosure date with you (normally when the fix is released, and
no later than 90 days after the report), and credit you in the advisory unless you prefer to stay
anonymous.

## Scope

In scope, for the contract in `contracts/upstream`:

- Paying out more than a split received, or paying the wrong recipient
- Redirecting funds already credited to a past epoch
- Locking funds so recipients can never collect them
- Bypassing authorization on owner or recipient actions
- One recipient's failure blocking other recipients from collecting
- Accounting, rounding or overflow errors
- Storage expiry or archival causing loss of balances

Out of scope:

- Vulnerabilities in Stellar Core, Soroban, the SDK or other dependencies. Please report those to
  their maintainers, and let us know if Upstream is affected.
- Known limitations documented in the README, such as split loops or excess from tokens that
  over-report transfers
- Social engineering, phishing, and attacks on infrastructure we don't operate

## Safe harbor

We will not pursue action against research done in good faith that follows this policy: test only
on local networks or testnet, never against other people's funds, and give us a reasonable chance to
fix the issue before disclosing it.
