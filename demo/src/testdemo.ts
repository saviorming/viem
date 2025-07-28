import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getContract,
  http,
  parseEther,
  parseGwei,
  publicActions,
  parseEventLogs,
} from "viem";
import { foundry } from "viem/chains";
import dotenv from "dotenv";

import Counter_ABI from './abis/Counter.json' with { type: 'json' };
import ERC20_ABI from './abis/MyERC20.json' with { type: 'json' };
import { privateKeyToAccount } from "viem/accounts";
dotenv.config();

 console.log(`客户端开始启动!`); 
//测试合约的地址 
const COUNTER_ADDRESS = "0x9A676e781A523b5d0C0e43731313A708CB607508";
const main = async () => {
 console.log(`客户端开始启动`); 
   const publicClient = createPublicClient({
    chain: foundry,
    transport: http(process.env.RPC_URL!),
  }).extend(publicActions);
    const blockNumber = await publicClient.getBlockNumber();
  console.log(`当前的区块号是 ${blockNumber}`);


    const tbalance = formatEther(await publicClient.getBalance({
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  }));

  console.log(`The balance of 0xf39 is ${tbalance}`);
};
main();

