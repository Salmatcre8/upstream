# upstream-splits

TypeScript client for [Upstream](https://github.com/Salmatcre8/upstream) — weighted,
nestable, pull-based fund splits on Stellar.

The `Client` and the contract types are generated from the deployed contract's own
interface. Everything else in this package exists so that a mistake costs you a type
error instead of a transaction fee.

> Not yet published to npm. Install it from the repository:
>
> ```sh
> npm install github:Salmatcre8/upstream#path:/sdk
> ```

## Reading a split

Reads are answered by simulation, so this needs no keys, funds or signatures.

```ts
import { Client, networks, account, formatAmount } from "upstream-splits";

/** Native XLM wrapped as a Stellar Asset Contract, on testnet. */
const XLM = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const upstream = new Client({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
});

const { result: split } = await upstream.get_split({ split_id: 0n });
const { result: owed } = await upstream.claimable({
  split_id: 0n,
  epoch: split.epoch,
  payee: account("GBMD…OUBJ"),
  token: XLM,
});

console.log(`${formatAmount(owed)} XLM waiting`);
```

[`examples/read-split.ts`](examples/read-split.ts) is a runnable version that prints a
whole split. Against the live testnet deployment:

```
$ npm run example:read

contract CAZLMMGSAHCLH66EHM6ROL3PA2Y5Z2OQKJHN7GMZEBGDGVRYYCGHRGBS
rpc      https://soroban-testnet.stellar.org

split 0
  owner   GDWNGXL6S6DN5RJYIJLJ6VRQ6FHRV7MWJVP7ML66NPZILI3NIXL6HVAB
  epoch   0
  locked  false
  taken in 12.1 XLM this epoch

recipients
       70%  account:GBMDBJHWHLPYYO2LQH3W2WZYVB76HJFA2IS5AGPCPOH4NWMWYYKKOUBJ   owed 0.07 XLM
       30%  account:GBC3FCQMVSXZZQPGYWSLXU5KEYAXLA3PDHBNOAGTK5NKA2JBA4TZSKO6   owed 0.03 XLM

  0.1 XLM is waiting to be collected
```

## Weights that actually add up

A split's weights are parts per million and must total **exactly 1,000,000**. The
contract rejects anything else with `WeightsDoNotSumToTotal`, which is an easy and
annoying way to waste a fee. So describe shares in whatever units suit you and let
the package do the arithmetic:

```ts
import { account, nested, recipientsFromShares } from "upstream-splits";

const recipients = recipientsFromShares([
  { payee: account(maintainer), share: 90 },
  { payee: nested(0n), share: 10 }, // 10% to a split of the dependencies
]);
// weights 900_000 and 100_000
```

Shares are relative, so `[70, 30]`, `[7, 3]` and `[0.7, 0.3]` all mean the same thing.
Where a split does not divide cleanly, the spare units go to whoever rounding
shortchanged the most — the largest remainder method — so three equal recipients get
333,334 / 333,333 / 333,333 and the total is always exact:

```ts
evenSplit([account(a), account(b), account(c)]);
```

The arithmetic is done in `BigInt`, not floating point, and the awkward cases are
covered by tests.

`recipientsFromShares` refuses, up front, every list the contract would reject: an
empty one, more than 50 recipients, a duplicate payee, a non-positive share, or a share
so small it would round down to a zero weight. For a list you built by hand,
`assertValidRecipients` applies the same rules.

## Amounts

Token amounts are integer base units — 1 XLM is 10,000,000 stroops — and `i128`
on-chain, so they arrive as `bigint`. Converting by hand invites floating point
rounding into your payments:

```ts
import { parseAmount, formatAmount } from "upstream-splits";

parseAmount("0.1"); //  1_000_000n exactly, where 0.1 * 1e7 is not
formatAmount(7_000_000n); // "0.7"
parseAmount("2", 6); // a six-decimal token
```

## API

| Export | What it does |
|---|---|
| `Client` | The contract client, with every entrypoint |
| `networks` | Network passphrase and contract id per network |
| `Errors` | The contract's error codes and messages |
| `Payee`, `Recipient`, `SplitInfo` | Contract types |
| `account`, `nested` | Build a `Payee` without writing the tagged union by hand |
| `recipientsFromShares`, `evenSplit` | Shares in any units to exact ppm weights |
| `assertValidRecipients` | Apply the contract's rules client-side |
| `payeeKey`, `weightToPercent` | Display and comparison helpers |
| `parseAmount`, `formatAmount` | Decimal text to and from base units |
| `TOTAL_WEIGHT`, `MAX_RECIPIENTS`, `STROOP_DECIMALS` | The contract's constants |

`WeightError` and `AmountError` are what this package throws; errors from the contract
itself surface through the generated client.

## Development

```sh
npm install
npm test             # builds, then runs the unit tests
npm run example:read # reads the live testnet deployment
```

`src/bindings.ts` is generated and should not be edited by hand. Regenerate it after
changing the contract's interface:

```sh
npm run regenerate   # builds the contract and rewrites the bindings
npm run check-bindings
```

CI runs `check-bindings` on every pull request, so the client cannot drift away from
the contract unnoticed.

## License

Apache-2.0, as with the rest of the repository.
