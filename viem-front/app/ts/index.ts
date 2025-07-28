import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

// 创建公共客户端（用于读取链数据）
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/你的API_KEY'),
});

// 示例：获取最新区块号
async function getLatestBlockNumber() {
  const blockNumber = await publicClient.getBlockNumber();
  console.log('最新区块号:', Number(blockNumber));
}

getLatestBlockNumber();