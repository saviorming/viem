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
import { keccak256 } from 'viem'; // 从viem主模块导入keccak256
import { encodePacked } from 'viem'; // encodePacked在abi模块

dotenv.config();

console.log(`客户端开始启动!`); 
// 配置公共客户端
const client = createPublicClient({
  chain: foundry, // 根据实际链选择
  transport: http('http://127.0.0.1:8545'), // 替换为你的RPC地址
});
// 合约配置 - 替换为你的合约地址
const config = {
  contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as `0x${string}`,
  arraySlot: 0n // _locks数组的存储槽位，根据实际情况调整
}; // 必须是十六进制字符串
// LockInfo结构的类型定义
interface LockInfo {
  user: `0x${string}`;
  startTime: bigint;
  amount: bigint;
}

/**
 * 安全获取存储槽数据
 */
async function getStorageSlot(slot: bigint): Promise<`0x${string}`> {
  const slotHex = `0x${slot.toString(16).padStart(64, '0')}` as `0x${string}`;
  const result = await client.getStorageAt({
    address: config.contractAddress,
    slot: slotHex
  });
  
  if (!result) {
    throw new Error(`无法读取存储槽: ${slotHex}`);
  }
  
  return result;
}

/**
 * 计算动态数组元素的存储槽位
 */
function getArrayElementSlot(arraySlot: bigint, index: number): bigint {
  // 转换数组槽位为64字符十六进制
  const arraySlotHex = `0x${arraySlot.toString(16).padStart(64, '0')}` as `0x${string}`;
  // 计算哈希值 (Solidity动态动态数组存储规则)
  const hashedSlot = keccak256(encodePacked(['bytes32'], [arraySlotHex]));
  // 元素槽位 = 哈希值 + 索引
  return BigInt(hashedSlot) + BigInt(index);
}

/**
 * 读取单个LockInfo结构体
 */
async function readLockInfo(elementSlot: bigint): Promise<LockInfo> {
  // 读取user (address类型，存储在elementSlot)
  const userData = await getStorageSlot(elementSlot);
  const user = `0x${userData.slice(26)}` as `0x${string}`; // 提取地址的20字节
  
  // 读取startTime (uint64类型，存储在elementSlot + 1)
  const startTimeData = await getStorageSlot(elementSlot + 1n);
  const startTime = BigInt(startTimeData);
  
  // 读取amount (uint256类型，存储在elementSlot + 2)
  const amountData = await getStorageSlot(elementSlot + 2n);
  const amount = BigInt(amountData);
  
  return { user, startTime, amount };
}

/**
 * 读取并打印所有锁仓信息
 */
async function readAllLocks() {
  try {
    // 1. 读取数组长度（存储在数组的基础槽位）
    const lengthData = await getStorageSlot(config.arraySlot);
    const length = Number(BigInt(lengthData));
    console.log(`共发现 ${length} 条锁定记录：\n`);
    
    // 2. 读取每个元素
    for (let i = 0; i < length; i++) {
      const elementSlot = getArrayElementSlot(config.arraySlot, i);
      const lockInfo = await readLockInfo(elementSlot);
      
      console.log(`locks[${i}]: user: ${lockInfo.user}, startTime: ${lockInfo.startTime}, amount: ${lockInfo.amount}`);
    }
  } catch (error) {
    console.error('读取过程出错:', error);
  }
}

// 执行
readAllLocks();