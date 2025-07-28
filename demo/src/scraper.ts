import { createPublicClient, http, parseAbi } from 'viem'
import { mainnet } from 'viem/chains'
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

// 目标合约地址
const TARGET_CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'

// 数据库连接实例
let db: sqlite3.Database | null = null

// 检查交易是否与目标合约相关
function isContractRelated(tx: any): boolean {
  // 检查交易的 to 地址是否为目标合约
  if (tx.to && tx.to.toLowerCase() === TARGET_CONTRACT_ADDRESS.toLowerCase()) {
    return true
  }
  
  // 检查交易日志中是否包含目标合约地址
  if (tx.logs && tx.logs.length > 0) {
    return tx.logs.some((log: any) => 
      log.address && log.address.toLowerCase() === TARGET_CONTRACT_ADDRESS.toLowerCase()
    )
  }
  
  return false
}

// 过滤与目标合约相关的日志
function filterContractLogs(logs: any[]): any[] {
  return logs.filter(log => 
    log.address && log.address.toLowerCase() === TARGET_CONTRACT_ADDRESS.toLowerCase()
  )
}

// 初始化数据库
async function initDatabase(): Promise<sqlite3.Database> {
  if (db) return db

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database('./blockchain_data.db', (err) => {
      if (err) {
        reject(err)
        return
      }
      
      // 创建表结构
      const createTables = async () => {
        const run = promisify(db!.run.bind(db!))
        
        await run(`
          CREATE TABLE IF NOT EXISTS blocks (
            number INTEGER PRIMARY KEY,
            hash TEXT,
            timestamp INTEGER,
            difficulty INTEGER,
            gasLimit INTEGER,
            gasUsed INTEGER,
            contractTxCount INTEGER DEFAULT 0
          )
        `)

        await run(`
          CREATE TABLE IF NOT EXISTS transactions (
            hash TEXT PRIMARY KEY,
            blockNumber INTEGER,
            fromAddress TEXT,
            toAddress TEXT,
            value TEXT,
            gasPrice TEXT,
            gasUsed INTEGER,
            isContractRelated BOOLEAN DEFAULT 0,
            FOREIGN KEY (blockNumber) REFERENCES blocks(number)
          )
        `)

        await run(`
          CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transactionHash TEXT,
            address TEXT,
            topics TEXT,
            data TEXT,
            isTargetContract BOOLEAN DEFAULT 0,
            FOREIGN KEY (transactionHash) REFERENCES transactions(hash)
          )
        `)
        
        resolve(db!)
      }
      
      createTables().catch(reject)
    })
  })
}

// 保存区块数据
async function saveBlock(block: any, contractTxCount: number = 0) {
  if (!db) throw new Error('数据库未初始化')

  return new Promise<void>((resolve, reject) => {
    db!.run(
      'INSERT INTO blocks (number, hash, timestamp, difficulty, gasLimit, gasUsed, contractTxCount) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        Number(block.number),
        block.hash,
        Number(block.timestamp),
        Number(block.difficulty),
        Number(block.gasLimit),
        Number(block.gasUsed),
        contractTxCount
      ],
      function(err) {
        if (err) reject(err)
        else resolve()
      }
    )
  })
}

// 保存交易数据
async function saveTransaction(tx: any, blockNumber: bigint, isContractRelated: boolean = false) {
  if (!db) throw new Error('数据库未初始化')

  return new Promise<void>((resolve, reject) => {
    db!.run(
      'INSERT INTO transactions (hash, blockNumber, fromAddress, toAddress, value, gasPrice, gasUsed, isContractRelated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tx.hash,
        Number(blockNumber),
        tx.from,
        tx.to || null,
        tx.value?.toString() || '0',
        tx.gasPrice?.toString() || '0',
        tx.gas,
        isContractRelated ? 1 : 0
      ],
      async function(err) {
        if (err) {
          reject(err)
          return
        }
        
        // 只保存与目标合约相关的日志
        if (tx.logs && tx.logs.length > 0 && isContractRelated) {
          try {
            const contractLogs = filterContractLogs(tx.logs)
            if (contractLogs.length > 0) {
              await saveLogs(contractLogs, tx.hash)
            }
            resolve()
          } catch (logErr) {
            reject(logErr)
          }
        } else {
          resolve()
        }
      }
    )
  })
}

// 保存日志数据
async function saveLogs(logs: any[], transactionHash: string) {
  if (!db) throw new Error('数据库未初始化')

  const insertPromises = logs.map(log => 
    new Promise<void>((resolve, reject) => {
      const isTargetContract = log.address && log.address.toLowerCase() === TARGET_CONTRACT_ADDRESS.toLowerCase()
      
      db!.run(
        'INSERT INTO logs (transactionHash, address, topics, data, isTargetContract) VALUES (?, ?, ?, ?, ?)',
        [
          transactionHash,
          log.address,
          JSON.stringify(log.topics),
          log.data,
          isTargetContract ? 1 : 0
        ],
        function(err) {
          if (err) reject(err)
          else resolve()
        }
      )
    })
  )

  await Promise.all(insertPromises)
}

// 扫描单个区块
async function scrapeBlock(client: any, blockNumber: bigint) {
  try {
    const block = await client.getBlock({
      blockNumber,
      includeTransactions: true
    })

    // 获取区块中的所有交易收据（包含日志信息）
    const txReceipts = await Promise.all(
      block.transactions.map(async (tx: any) => {
        try {
          const receipt = await client.getTransactionReceipt({ hash: tx.hash })
          return { ...tx, logs: receipt.logs }
        } catch (error) {
          console.warn(`获取交易收据失败 ${tx.hash}:`, error)
          return { ...tx, logs: [] }
        }
      })
    )

    // 过滤与目标合约相关的交易
    const contractRelatedTxs = txReceipts.filter(tx => isContractRelated(tx))
    
    // 保存区块数据（包含合约相关交易数量）
    await saveBlock(block, contractRelatedTxs.length)

    // 只保存与目标合约相关的交易
    if (contractRelatedTxs.length > 0) {
      const txPromises = contractRelatedTxs.map((tx: any) => 
        saveTransaction(tx, block.number, true)
      )
      await Promise.all(txPromises)
      
      console.log(`✓ 区块 ${Number(blockNumber)} 处理完成 - 发现 ${contractRelatedTxs.length} 个合约相关交易`)
    } else {
      console.log(`✓ 区块 ${Number(blockNumber)} 处理完成 - 无合约相关交易`)
    }
    
    return true
  } catch (error) {
    console.error(`✗ 区块 ${Number(blockNumber)} 处理失败:`, error)
    return false
  }
}

// 主函数
async function main() {
  try {
    console.log(`🎯 目标合约地址: ${TARGET_CONTRACT_ADDRESS}`)
    
    // 初始化数据库
    await initDatabase()

    // 创建Viem客户端 - 请替换为你的Infura API Key或其他RPC端点
    const client = createPublicClient({
      chain: mainnet,
      transport: http("http://127.0.0.1:8545")
    })

    // 获取当前链上最新区块
    const latestBlockNumber = await client.getBlockNumber()
    console.log(`当前最新区块高度: ${latestBlockNumber}`)

    // 配置扫描范围 - 从最新区块往前扫描100个区块
    const startBlock = BigInt(Number(latestBlockNumber) - 100)
    const endBlock = latestBlockNumber

    console.log(`开始扫描区块 ${startBlock} 到 ${endBlock}`)
    console.log(`只保存与合约 ${TARGET_CONTRACT_ADDRESS} 相关的交易和日志`)

    let totalContractTxs = 0

    // 顺序扫描区块
    for (let i = startBlock; i <= endBlock; i++) {
      const success = await scrapeBlock(client, i)
      if (success) {
        // 统计合约相关交易数量
        // 这里可以添加统计逻辑
      }
      
      // 控制扫描速率，避免被RPC节点限流
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log('✅ 扫描完成!')
    console.log(`📊 总共处理了 ${Number(endBlock - startBlock + 1n)} 个区块`)
  } catch (error) {
    console.error('❌ 程序执行出错:', error)
  } finally {
    // 关闭数据库连接
    if (db) {
      await new Promise<void>((resolve, reject) => {
        db!.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      console.log('数据库连接已关闭')
    }
  }
}

// 执行主函数
main()
    