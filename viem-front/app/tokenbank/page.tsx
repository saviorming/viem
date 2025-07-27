"use client"; 
import React, { useState, useEffect } from 'react';
import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { foundry } from 'viem/chains';
import { createWalletClient, custom } from 'viem';
import TokenBank_ABI from '../contracts/TokenBank.json';

// 环境配置
const config = {
  contractAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as `0x${string}`,
  rpcUrl: 'http://localhost:8545',
};

// 定义 ERC20 代币地址（必须与 TokenBank 构造函数传入的 _tokenAddress 一致）
const ERC20_TOKEN_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as `0x${string}`;

// ERC20 标准 ABI（包含 approve 函数）
const ERC20_ABI = [
  {
    "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

type TransactionStatus = 'idle' | 'pending' | 'success' | 'error';

const App = () => {
  const [account, setAccount] = useState<`0x${string}` | undefined>(undefined);
  const [balance, setBalance] = useState<string>('0');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [walletClient, setWalletClient] = useState<any>(null); // 初始化为 null

  // 创建公共客户端
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(config.rpcUrl),
  });

  // 在组件挂载后初始化 walletClient
  useEffect(() => {
    // 检查是否在浏览器环境中
    if (typeof window !== 'undefined' && window.ethereum) {
      const client = createWalletClient({
        chain: foundry,
        transport: custom(window.ethereum as any),
      });
      setWalletClient(client);
    }
  }, []);

  // 连接钱包
  const connectWallet = async () => {
    if (!walletClient) {
      setErrorMessage('钱包客户端未初始化，请确保已安装 MetaMask');
      return;
    }

    try {
      setErrorMessage('');
      const [account] = await walletClient.requestAddresses();
      setAccount(account);
    } catch (error) {
      console.error('连接钱包错误:', error);
      setErrorMessage('连接钱包失败，请确保已安装 MetaMask 并解锁');
    }
  };

  // 获取余额
  const fetchBalance = async () => {
    if (!account) return;

    try {
      const result = await publicClient.readContract({
        address: ERC20_TOKEN_ADDRESS,
        abi: TokenBank_ABI,
        functionName: 'balanceOf',
        args: [account],
      });

      setBalance(formatEther(result));
    } catch (error: any) {
      console.error('获取余额失败:', error);
      setErrorMessage(error.message || '无法获取余额');
    }
  };

  // 存款
  const handleDeposit = async () => {
    if (!walletClient || !account || !depositAmount) return;

    setTransactionStatus('pending');
    setErrorMessage('');

    try {
      const amount = parseEther(depositAmount);

      const hash = await walletClient.writeContract({
        account: account,
        address: config.contractAddress,
        abi: TokenBank_ABI,
        functionName: 'deposit',
        args: [amount]
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTransactionStatus('success');
      fetchBalance();
      setDepositAmount('');
    } catch (error: any) {
      console.error('存款失败:', error);
      setTransactionStatus('error');
      setErrorMessage(error.message || '存款失败');
    } finally {
      setTransactionStatus('idle');
    }
  };

  // 取款
  const handleWithdraw = async () => {
    if (!walletClient || !account || !withdrawAmount) return;

    setTransactionStatus('pending');
    setErrorMessage('');

    try {
      const amount = parseEther(withdrawAmount);

      const hash = await walletClient.writeContract({
        account: account,
        address: config.contractAddress,
        abi: TokenBank_ABI,
        functionName: 'withdraw',
        args: [amount],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTransactionStatus('success');
      fetchBalance();
      setWithdrawAmount('');
    } catch (error: any) {
      console.error('取款失败:', error);
      setTransactionStatus('error');
      setErrorMessage(error.message || '取款失败');
    } finally {
      setTransactionStatus('idle');
    }
  };

  // 页面加载时连接钱包并获取余额
  useEffect(() => {
    if (walletClient && typeof window !== 'undefined') {
      connectWallet();
    }
  }, [walletClient]);

  useEffect(() => {
    if (account) {
      fetchBalance();
    }
  }, [account]);

  // 连接钱包后检查网络
useEffect(() => {
  const checkNetwork = async () => {
    if (!walletClient) return;
    const chainId = await walletClient.getChainId();
    if (chainId !== foundry.id) {
      setErrorMessage(`请切换网络到 Foundry（链 ID: ${foundry.id}）`);
    }
  };
  if (account) checkNetwork();
}, [account, walletClient]);


  // 授权函数
const handleApprove = async () => {
  if (!walletClient || !account || !depositAmount) return;

  setTransactionStatus('pending');
  setErrorMessage('');

  try {
    const amount = parseEther(depositAmount);
    // 调用 ERC20 代币的 approve 函数，授权 TokenBank 合约使用代币
    const hash = await walletClient.writeContract({
      account,
      address: ERC20_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [config.contractAddress, amount] // 授权对象为 TokenBank 合约，授权金额为存款金额
    });

    await publicClient.waitForTransactionReceipt({ hash });
    setTransactionStatus('success');
    setErrorMessage('授权成功，请继续存款');
  } catch (error: any) {
    console.error('授权失败:', error);
    setTransactionStatus('error');
    setErrorMessage('授权失败：' + (error.message || '请重试'));
  } finally {
    setTransactionStatus('idle');
  }
};

  return (
    <div className="container mx-auto p-8 max-w-md">
      <h1 className="text-2xl font-bold mb-6 text-center">TokenBank</h1>

      {!account ? (
        <button
          onClick={connectWallet}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded transition-all duration-300"
        >
          连接钱包
        </button>
      ) : (
        <div>
          <div className="bg-gray-100 p-4 rounded-lg mb-6">
            <p className="text-sm text-gray-600 mb-1">当前账户</p>
            <p className="font-mono text-gray-800 truncate">{account}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
            <p className="text-sm text-gray-600 mb-1">账户余额</p>
            <p className="text-3xl font-bold text-gray-800">
              {balance} MTK
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">存款</label>
              <div className="flex">
                <input
                  type="text"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="输入 ETH 数量"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              <button
                onClick={handleApprove} // 先授权
                disabled={!depositAmount || transactionStatus === 'pending'}
                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 transition-all duration-300 disabled:opacity-50"
              >
                授权
              </button>
                <button
                  onClick={handleDeposit}
                  disabled={!depositAmount || transactionStatus === 'pending'}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-r-lg transition-all duration-300 disabled:opacity-50"
                >
                  存款
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">取款</label>
              <div className="flex">
                <input
                  type="text"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="输入 ETH 数量"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleWithdraw}
                  disabled={!withdrawAmount || transactionStatus === 'pending'}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-r-lg transition-all duration-300 disabled:opacity-50"
                >
                  取款
                </button>
              </div>
            </div>
          </div>

          {transactionStatus === 'pending' && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
              <p className="font-bold">处理中</p>
              <p>交易正在进行中，请稍候...</p>
            </div>
          )}

          {transactionStatus === 'success' && (
            <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4">
              <p className="font-bold">成功</p>
              <p>交易已确认</p>
            </div>
          )}

          {errorMessage && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
              <p className="font-bold">错误</p>
              <p>{errorMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;