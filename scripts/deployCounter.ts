import * as fs from "fs";
import * as dotenv from "dotenv";
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { mnemonicToWalletKey } from "@ton/crypto";
import { TonClient, Cell, WalletContractV4 } from "@ton/ton";
import Counter from "../wrappers/Counter"; // this is the interface class from step 7

// Load environment variables
dotenv.config();

export async function run() {
  // initialize ton rpc client on testnet
  const endpoint = await getHttpEndpoint({ network: "testnet" });
  const client = new TonClient({ endpoint });

  // prepare Counter's initial code and data cells for deployment
  const counterCode = Cell.fromBoc(fs.readFileSync("build/counter.cell"))[0]; // compilation output from step 6
  const initialCounterValue = Date.now(); // to avoid collisions use current number of milliseconds since epoch as initial value
  const counter = Counter.createForDeploy(counterCode, initialCounterValue);

  // exit if contract is already deployed
  console.log("contract address:", counter.address.toString());
  if (await client.isContractDeployed(counter.address)) {
    return console.log("Counter already deployed");
  }

  // open wallet v4 (notice the correct wallet version here)
  const mnemonic = process.env.WALLET_MNEMONIC;
  if (!mnemonic) {
    throw new Error("WALLET_MNEMONIC environment variable is not set");
  }
  const key = await mnemonicToWalletKey(mnemonic.split(" "));
  const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
  if (!await client.isContractDeployed(wallet.address)) {
    return console.log("wallet is not deployed");
  }

  // open wallet and read the current seqno of the wallet
  const walletContract = client.open(wallet);
  const walletSender = walletContract.sender(key.secretKey);
  const seqno = await walletContract.getSeqno();

  // send the deploy transaction
  const counterContract = client.open(counter);
  await counterContract.sendDeploy(walletSender);

  // wait until confirmed
  let currentSeqno = seqno;
  while (currentSeqno == seqno) {
    console.log("waiting for deploy transaction to confirm...");
    await sleep(1500);
    currentSeqno = await walletContract.getSeqno();
  }
  console.log("deploy transaction confirmed!");
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
