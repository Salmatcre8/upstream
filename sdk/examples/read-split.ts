/**
 * Read a live split from the testnet deployment and print who is owed what.
 *
 * Everything here is read-only: the calls are answered by simulation, so no
 * keys, funds or signatures are involved.
 *
 *   npm run example:read            # split 0 of the deployed contract
 *   SPLIT_ID=2 npm run example:read
 */
import {
  Client,
  formatAmount,
  networks,
  payeeKey,
  weightToPercent,
  type Recipient,
} from "../src/index.js";

const RPC_URL = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const SPLIT_ID = BigInt(process.env.SPLIT_ID ?? "0");

/** Native XLM wrapped as a Stellar Asset Contract, on testnet. */
const XLM = process.env.TOKEN ?? "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

async function main(): Promise<void> {
  const upstream = new Client({ ...networks.testnet, rpcUrl: RPC_URL });

  console.log(`contract ${networks.testnet.contractId}`);
  console.log(`rpc      ${RPC_URL}\n`);

  const { result: nextId } = await upstream.next_split_id();
  if (SPLIT_ID >= nextId) {
    console.error(`split ${SPLIT_ID} does not exist yet; ${nextId} splits have been created`);
    process.exitCode = 1;
    return;
  }

  const { result: split } = await upstream.get_split({ split_id: SPLIT_ID });
  const { result: recipients } = await upstream.get_recipients({
    split_id: SPLIT_ID,
    epoch: split.epoch,
  });
  const { result: received } = await upstream.get_received({
    split_id: SPLIT_ID,
    epoch: split.epoch,
    token: XLM,
  });

  console.log(`split ${SPLIT_ID}`);
  console.log(`  owner   ${split.owner}`);
  console.log(`  epoch   ${split.epoch}`);
  console.log(`  locked  ${split.locked}`);
  console.log(`  taken in ${formatAmount(received)} XLM this epoch\n`);

  const claimable = await Promise.all(
    recipients.map(async (recipient: Recipient) => {
      const { result } = await upstream.claimable({
        split_id: SPLIT_ID,
        epoch: split.epoch,
        payee: recipient.payee,
        token: XLM,
      });
      return result;
    }),
  );

  console.log("recipients");
  recipients.forEach((recipient: Recipient, i: number) => {
    const owed = formatAmount(claimable[i] ?? 0n);
    const share = weightToPercent(recipient.weight).padStart(8);
    console.log(`  ${share}  ${payeeKey(recipient.payee).padEnd(66)} owed ${owed} XLM`);
  });

  const outstanding = claimable.reduce((sum, amount) => sum + amount, 0n);
  console.log(`\n  ${formatAmount(outstanding)} XLM is waiting to be collected`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
