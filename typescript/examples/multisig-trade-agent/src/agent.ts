import { promises as fs } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  generateText,
  tool,
  type Tool,
  type CoreMessage,
  type CoreUserMessage,
  type CoreAssistantMessage,
  type StepResult,
} from 'ai';
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { 
  createPublicClient, 
  http, 
  parseAbi, 
  encodeFunctionData, 
  type Address,
  parseUnits,
  formatUnits,
  type PublicClient
} from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { z } from 'zod';
import type { Task } from 'a2a-samples-js';
import {
  SwapResponseSchema,
  TransactionPlansSchema,
  type SwapResponse,
  type TransactionPlan,
  McpGetCapabilitiesResponseSchema,
  type McpGetCapabilitiesResponse,
  SwapTokensSchema,
  AskEncyclopediaSchema,
} from 'ember-schemas';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

export interface MultisigSwapOperation {
  type: 'swap' | 'initialize' | 'submitTransaction' | 'confirmTransaction' | 'executeTransaction' | 'isOwner' | 'getTransactionCount';
  swapData?: {
    fromToken: string;
    toToken: string;
    amount: string;
    fromChain?: string;
    toChain?: string;
  };
  multisigData?: {
    owners?: string[];
    numConfirmationsRequired?: number;
    txIndex?: number;
    to?: string;
    value?: string;
    data?: string;
    checkAddress?: string;
  };
}

export class MultisigTradeAgent {
  private publicClient: PublicClient;
  private multisigContractAddress: string;
  private mcpClient: Client | null = null;
  private tokenMap: Record<string, TokenInfo[]> = {};
  private availableTokens: string[] = [];
  private camelotContextContent: string = '';
  public conversationHistory: CoreMessage[] = [];
  
  private multisigAbi = parseAbi([
    'function initialize(address[] memory owners, uint256 num_confirmations_required) external',
    'function submitTransaction(address to, uint256 value, bytes calldata data) external',
    'function confirmTransaction(uint256 tx_index) external',
    'function executeTransaction(uint256 tx_index) external',
    'function isOwner(address check_address) external view returns (bool)',
    'function getTransactionCount() external view returns (uint256)',
    'function getTransaction(uint256 tx_index) external view returns (address, uint256, bytes memory, bool, uint256)',
    'function numConfirmationsRequired() external view returns (uint256)',
  ]);

  constructor(
    private rpcUrl: string,
    multisigContractAddress: string,
    private quicknodeSubdomain: string,
    private quicknodeApiKey: string
  ) {
    this.multisigContractAddress = multisigContractAddress;
    this.publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(this.rpcUrl),
    }) as any;

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set!');
    }
  }

  async init(): Promise<void> {
    console.log('MultisigTradeAgent initialized with contract:', this.multisigContractAddress);
    
    // Initialize conversation history
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are a Multisig Trading AI agent that provides access to blockchain swapping functionalities through a multisig contract. You can:

1. **Swap tokens** - Route swaps through the multisig contract requiring multiple signatures
2. **Manage multisig** - Initialize, submit, confirm, and execute transactions
3. **Answer questions** - About Camelot DEX and multisig operations

Available actions:
- swap: Execute token swaps through multisig (requires multiple confirmations)
- initialize: Set up multisig with owners and confirmation requirements
- submitTransaction: Submit any transaction to multisig
- confirmTransaction: Confirm a pending multisig transaction
- executeTransaction: Execute a confirmed multisig transaction
- isOwner: Check if an address is a multisig owner
- getTransactionCount: Get total number of multisig transactions

For swaps, use the same format as regular swapping but remember all transactions go through multisig.

Examples:
- "Swap 1 ETH to USDC" - Creates a swap transaction in the multisig
- "Initialize multisig with 3 confirmations" - Sets up multisig requiring 3 signatures
- "Confirm transaction 0" - Confirms pending multisig transaction #0
- "Execute transaction 1" - Executes confirmed multisig transaction #1`,
      },
    ];

    // Initialize MCP client for swapping
    await this.initializeMcpClient();
  }

  private async initializeMcpClient(): Promise<void> {
    try {
      console.log('Initializing MCP client for swapping...');
      this.mcpClient = new Client(
        { name: 'MultisigTradeAgent', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      const require = createRequire(import.meta.url);
      const mcpToolPath = require.resolve('ember-mcp-tool-server');

      const transport = new StdioClientTransport({
        command: 'node',
        args: [mcpToolPath],
        env: {
          ...process.env,
          EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? 'grpc.api.emberai.xyz:50051',
        },
      });

      await this.mcpClient.connect(transport);
      console.log('MCP client initialized successfully.');

      // Fetch swap capabilities
      const swapCapabilities = await this.fetchSwapCapabilities();
      if (swapCapabilities?.capabilities) {
        this.tokenMap = {};
        this.availableTokens = [];
        swapCapabilities.capabilities.forEach((capabilityEntry: any) => {
          if (capabilityEntry.swapCapability) {
            const swapCap = capabilityEntry.swapCapability;
            swapCap.supportedTokens?.forEach((token: any) => {
              if (token.symbol && token.tokenUid?.chainId && token.tokenUid?.address) {
                const symbol = token.symbol;
                let tokenList = this.tokenMap[symbol];
                if (!tokenList) {
                  tokenList = [];
                  this.tokenMap[symbol] = tokenList;
                  this.availableTokens.push(symbol);
                }
                tokenList.push({
                  chainId: token.tokenUid.chainId,
                  address: token.tokenUid.address,
                  decimals: token.decimals ?? 18,
                });
              }
            });
          }
        });
      }

      await this.loadCamelotDocumentation();
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      throw new Error('Swap functionality initialization failed');
    }
  }

  private async fetchSwapCapabilities(): Promise<McpGetCapabilitiesResponse | null> {
    if (!this.mcpClient) return null;
    
    try {
      const capabilitiesResult = await this.mcpClient.callTool({
        name: 'getCapabilities',
        arguments: { type: 'SWAP' },
      });

      const dataToValidate = parseMcpToolResponsePayload(capabilitiesResult, z.any());
      const validationResult = McpGetCapabilitiesResponseSchema.safeParse(dataToValidate);

      if (!validationResult.success) {
        console.error('Swap capabilities validation failed:', validationResult.error);
        return null;
      }

      return validationResult.data;
    } catch (error) {
      console.error('Error fetching swap capabilities:', error);
      return null;
    }
  }

  private async loadCamelotDocumentation(): Promise<void> {
    try {
      const defaultDocsPath = path.resolve(__dirname, '../../../swapping-agent-no-wallet/encyclopedia');
      const filePath = path.join(defaultDocsPath, 'camelot-01.md');
      const content = await fs.readFile(filePath, 'utf-8');
      this.camelotContextContent = content;
    } catch (error) {
      console.error('Warning: Could not load Camelot documentation:', error);
      this.camelotContextContent = '';
    }
  }

  async processUserInput(instruction: string, userAddress: Address): Promise<Task> {
    const taskId = `multisig-trade-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    try {
      console.log('[MultisigTradeAgent] Processing:', instruction);

      const operation = this.parseInstruction(instruction, userAddress);

      switch (operation.type) {
        case 'swap':
          if (!operation.swapData) {
            throw new Error('Swap parameters are required');
          }
          return await this.handleSwap(taskId, userAddress, operation.swapData);

        case 'initialize':
          if (!operation.multisigData?.owners || !operation.multisigData?.numConfirmationsRequired) {
            throw new Error('Owners and confirmation requirements are required for initialization');
          }
          return await this.handleInitialize(taskId, userAddress, operation.multisigData.owners, operation.multisigData.numConfirmationsRequired);
          
        case 'confirmTransaction':
          if (operation.multisigData?.txIndex === undefined) {
            throw new Error('Transaction index is required for confirmation');
          }
          return await this.handleConfirmTransaction(taskId, userAddress, operation.multisigData.txIndex);
          
        case 'executeTransaction':
          if (operation.multisigData?.txIndex === undefined) {
            throw new Error('Transaction index is required for execution');
          }
          return await this.handleExecuteTransaction(taskId, userAddress, operation.multisigData.txIndex);
          
        case 'isOwner':
          return await this.handleIsOwner(taskId, userAddress, operation.multisigData?.checkAddress || userAddress);

        case 'getTransactionCount':
          return await this.handleGetTransactionCount(taskId, userAddress);
          
        default:
          throw new Error('Unknown operation type');
      }
    } catch (error) {
      console.error('[MultisigTradeAgent] Error:', error);
      return this.createErrorTask(
        taskId || `multisig-trade-error-${Date.now()}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private parseInstruction(instruction: string, userAddress: Address): MultisigSwapOperation {
    const lowerInstruction = instruction.toLowerCase();

    // Check for swap operations
    const swapKeywords = ['swap', 'trade', 'exchange', 'convert', 'sell', 'buy'];
    if (swapKeywords.some(keyword => lowerInstruction.includes(keyword))) {
      // Parse swap parameters (simplified version)
      const amountMatch = lowerInstruction.match(/(\d+(?:\.\d+)?)/);
      const fromTokenMatch = lowerInstruction.match(/(?:swap|sell|convert)\s+(?:\d+(?:\.\d+)?\s+)?(\w+)/);
      const toTokenMatch = lowerInstruction.match(/(?:to|for|into)\s+(\w+)/);

      if (amountMatch && fromTokenMatch && toTokenMatch) {
        return {
          type: 'swap',
          swapData: {
            amount: amountMatch[1],
            fromToken: fromTokenMatch[1],
            toToken: toTokenMatch[1],
          }
        };
      } else {
        throw new Error('Please specify the swap amount, from token, and to token. Example: "Swap 1 ETH to USDC"');
      }
    }

    // Check for multisig initialization
    const initMatch = lowerInstruction.match(/initialize.*?(\d+)\s+confirmation/);
    if (initMatch || lowerInstruction.includes('initialize')) {
      const numConfirmations = initMatch?.[1] ? parseInt(initMatch[1]) : 2;
      return {
        type: 'initialize',
        multisigData: {
          owners: [userAddress],
          numConfirmationsRequired: numConfirmations
        }
      };
    }

    // Check for confirm transaction operations
    const confirmMatch = lowerInstruction.match(/confirm.*?(?:transaction|tx)\s+(\d+)/);
    if (confirmMatch || lowerInstruction.includes('confirm')) {
      const txIndex = confirmMatch?.[1] ? parseInt(confirmMatch[1]) : 0;
      return {
        type: 'confirmTransaction',
        multisigData: { txIndex }
      };
    }

    // Check for execute transaction operations
    const executeMatch = lowerInstruction.match(/execute.*?(?:transaction|tx)\s+(\d+)/);
    if (executeMatch || lowerInstruction.includes('execute')) {
      const txIndex = executeMatch?.[1] ? parseInt(executeMatch[1]) : 0;
      return {
        type: 'executeTransaction',
        multisigData: { txIndex }
      };
    }

    // Check for transaction count
    if (lowerInstruction.includes('count') || lowerInstruction.includes('total')) {
      return { type: 'getTransactionCount' };
    }

    // Check for owner verification
    if (lowerInstruction.includes('owner') || lowerInstruction.includes('check')) {
      return {
        type: 'isOwner',
        multisigData: { checkAddress: userAddress }
      };
    }

    // Default to owner check
    return {
      type: 'isOwner',
      multisigData: { checkAddress: userAddress }
    };
  }

  private async handleSwap(taskId: string, userAddress: Address, swapData: MultisigSwapOperation['swapData']): Promise<Task> {
    if (!swapData || !this.mcpClient) {
      throw new Error('Swap data or MCP client not available');
    }

    try {
      // Find token details
      const fromTokenDetail = this.findTokenDetail(swapData.fromToken, swapData.fromChain);
      const toTokenDetail = this.findTokenDetail(swapData.toToken, swapData.toChain);

      if (typeof fromTokenDetail === 'string') {
        return this.createInputRequiredTask(taskId, userAddress, fromTokenDetail);
      }
      if (typeof toTokenDetail === 'string') {
        return this.createInputRequiredTask(taskId, userAddress, toTokenDetail);
      }

      const atomicAmount = parseUnits(swapData.amount, fromTokenDetail.decimals);

      // Get swap transaction from MCP
      const swapResponseRaw = await this.mcpClient.callTool({
        name: 'swapTokens',
        arguments: {
          fromTokenAddress: fromTokenDetail.address || '',
          fromTokenChainId: fromTokenDetail.chainId || '42161',
          toTokenAddress: toTokenDetail.address || '',
          toTokenChainId: toTokenDetail.chainId || '42161',
          amount: atomicAmount.toString(),
          userAddress: userAddress,
        },
      });

      const validatedSwapResponse = parseMcpToolResponsePayload(swapResponseRaw, SwapResponseSchema);
      const swapTransactions = TransactionPlansSchema.parse(validatedSwapResponse.transactions);

      if (swapTransactions.length === 0) {
        throw new Error('No swap transactions received from MCP');
      }

      // Take the main swap transaction (assuming it's the last one after approvals)
      const mainSwapTx = swapTransactions[swapTransactions.length - 1];
      
      if (!mainSwapTx) {
        throw new Error('No valid swap transaction found');
      }

      // Submit this swap transaction to the multisig
      // @ts-ignore - Bypassing strict type checking for address format
      const submitTxData = encodeFunctionData({
        abi: this.multisigAbi,
        functionName: 'submitTransaction',
        args: [
          (mainSwapTx.to || '0x0000000000000000000000000000000000000000'),
          BigInt(mainSwapTx.value || '0'),
          (mainSwapTx.data || '0x')
        ]
      });

      return {
        id: taskId,
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Ready to submit swap transaction to multisig: ${swapData.amount} ${swapData.fromToken} → ${swapData.toToken}. This will require multiple signatures to execute.`,
              },
            ],
          },
        },
        artifacts: [
          {
            name: 'multisig-swap-transaction',
            parts: [
              {
                type: 'data',
                data: {
                  txPreview: {
                    operation: 'swap',
                    multisigContractAddress: this.multisigContractAddress,
                    userAddress,
                    swapDetails: {
                      fromToken: swapData.fromToken,
                      toToken: swapData.toToken,
                      amount: swapData.amount,
                      fromChain: fromTokenDetail.chainId,
                      toChain: toTokenDetail.chainId,
                    },
                    originalSwapTx: {
                      to: mainSwapTx.to,
                      data: mainSwapTx.data,
                      value: mainSwapTx.value,
                    },
                  },
                  txPlan: [
                    {
                      to: this.multisigContractAddress as Address,
                      data: submitTxData as `0x${string}`,
                      value: '0',
                      chainId: arbitrumSepolia.id,
                    }
                  ],
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to prepare multisig swap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private findTokenDetail(tokenName: string, chainName?: string): TokenInfo | string {
    const tokens = this.findTokensCaseInsensitive(tokenName);
    if (!tokens) {
      throw new Error(`Token ${tokenName} not supported.`);
    }

    if (chainName) {
      const chainId = this.mapChainNameToId(chainName);
      if (!chainId) {
        throw new Error(`Chain name ${chainName} is not recognized.`);
      }
      const tokenDetail = tokens.find(token => token.chainId === chainId);
      if (!tokenDetail) {
        throw new Error(`Token ${tokenName} not supported on chain ${chainName}`);
      }
      return tokenDetail;
    } else {
      if (tokens.length > 1) {
        const chainList = tokens.map((t, idx) => `${idx + 1}. ${this.mapChainIdToName(t.chainId)}`).join('\n');
        return `Multiple chains supported for ${tokenName}:\n${chainList}\nPlease specify the chain.`;
      }
      const firstToken = tokens[0];
      if (!firstToken) {
        throw new Error(`No token found for ${tokenName}`);
      }
      return firstToken;
    }
  }

  private findTokensCaseInsensitive(tokenName: string): TokenInfo[] | undefined {
    const lowerCaseTokenName = tokenName.toLowerCase();
    for (const key in this.tokenMap) {
      if (key.toLowerCase() === lowerCaseTokenName) {
        return this.tokenMap[key];
      }
    }
    return undefined;
  }

  private mapChainNameToId(chainName: string): string | undefined {
    const chainMappings = [
      { id: '1', name: 'Ethereum', aliases: ['mainnet'] },
      { id: '42161', name: 'Arbitrum', aliases: [] },
      { id: '10', name: 'Optimism', aliases: [] },
      { id: '137', name: 'Polygon', aliases: ['matic'] },
      { id: '8453', name: 'Base', aliases: [] },
    ];
    
    const normalized = chainName.toLowerCase();
    const found = chainMappings.find(
      mapping => mapping.name.toLowerCase() === normalized || mapping.aliases.includes(normalized)
    );
    return found?.id;
  }

  private mapChainIdToName(chainId: string): string {
    const chainMappings = [
      { id: '1', name: 'Ethereum' },
      { id: '42161', name: 'Arbitrum' },
      { id: '10', name: 'Optimism' },
      { id: '137', name: 'Polygon' },
      { id: '8453', name: 'Base' },
    ];
    
    const found = chainMappings.find(mapping => mapping.id === chainId);
    return found?.name || chainId;
  }

  private async handleInitialize(taskId: string, userAddress: Address, owners: string[], numConfirmationsRequired: number): Promise<Task> {
    try {
      const initializeData = encodeFunctionData({
        abi: this.multisigAbi,
        functionName: 'initialize',
        args: [owners as Address[], BigInt(numConfirmationsRequired)]
      });

      return {
        id: taskId,
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Ready to initialize multisig with ${owners.length} owner(s) requiring ${numConfirmationsRequired} confirmation(s). Please sign the transaction.`,
              },
            ],
          },
        },
        artifacts: [
          {
            name: 'multisig-initialization',
            parts: [
              {
                type: 'data',
                data: {
                  txPreview: {
                    operation: 'initialize',
                    multisigContractAddress: this.multisigContractAddress,
                    userAddress,
                    owners,
                    numConfirmationsRequired,
                  },
                  txPlan: [
                    {
                      to: this.multisigContractAddress as Address,
                      data: initializeData as `0x${string}`,
                      value: '0',
                      chainId: arbitrumSepolia.id,
                    }
                  ],
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to prepare initialize transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleConfirmTransaction(taskId: string, userAddress: Address, txIndex: number): Promise<Task> {
    try {
      const confirmTxData = encodeFunctionData({
        abi: this.multisigAbi,
        functionName: 'confirmTransaction',
        args: [BigInt(txIndex)]
      });

      return {
        id: taskId,
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Ready to confirm transaction #${txIndex} in the multisig wallet. Please sign the transaction.`,
              },
            ],
          },
        },
        artifacts: [
          {
            name: 'multisig-confirmation',
            parts: [
              {
                type: 'data',
                data: {
                  txPreview: {
                    operation: 'confirmTransaction',
                    multisigContractAddress: this.multisigContractAddress,
                    userAddress,
                    txIndex,
                  },
                  txPlan: [
                    {
                      to: this.multisigContractAddress as Address,
                      data: confirmTxData as `0x${string}`,
                      value: '0',
                      chainId: arbitrumSepolia.id,
                    }
                  ],
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to prepare confirm transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleExecuteTransaction(taskId: string, userAddress: Address, txIndex: number): Promise<Task> {
    try {
      const executeTxData = encodeFunctionData({
        abi: this.multisigAbi,
        functionName: 'executeTransaction',
        args: [BigInt(txIndex)]
      });

      return {
        id: taskId,
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Ready to execute transaction #${txIndex} in the multisig wallet. Please sign the transaction.`,
              },
            ],
          },
        },
        artifacts: [
          {
            name: 'multisig-execution',
            parts: [
              {
                type: 'data',
                data: {
                  txPreview: {
                    operation: 'executeTransaction',
                    multisigContractAddress: this.multisigContractAddress,
                    userAddress,
                    txIndex,
                  },
                  txPlan: [
                    {
                      to: this.multisigContractAddress as Address,
                      data: executeTxData as `0x${string}`,
                      value: '0',
                      chainId: arbitrumSepolia.id,
                    }
                  ],
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to prepare execute transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleIsOwner(taskId: string, userAddress: Address, checkAddress: Address): Promise<Task> {
    try {
      const isOwner = await this.publicClient.readContract({
        address: this.multisigContractAddress as Address,
        abi: this.multisigAbi,
        functionName: 'isOwner',
        args: [checkAddress]
      });

      return {
        id: taskId,
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `${checkAddress} is ${isOwner ? '' : 'not '}an owner of the multisig wallet.`,
              },
            ],
          },
        },
        artifacts: [
          {
            name: 'owner-check-result',
            parts: [
              {
                type: 'data',
                data: {
                  txPreview: {
                    operation: 'isOwner',
                    multisigContractAddress: this.multisigContractAddress,
                    userAddress,
                    checkAddress,
                    isOwner: Boolean(isOwner),
                  },
                  txPlan: null,
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to check owner status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetTransactionCount(taskId: string, userAddress: Address): Promise<Task> {
    try {
      const txCount = await this.publicClient.readContract({
        address: this.multisigContractAddress as Address,
        abi: this.multisigAbi,
        functionName: 'getTransactionCount',
      });

      return {
        id: taskId,
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Multisig wallet has ${txCount.toString()} total transactions.`,
              },
            ],
          },
        },
        artifacts: [
          {
            name: 'transaction-count-result',
            parts: [
              {
                type: 'data',
                data: {
                  txPreview: {
                    operation: 'getTransactionCount',
                    multisigContractAddress: this.multisigContractAddress,
                    userAddress,
                    transactionCount: txCount.toString(),
                  },
                  txPlan: null,
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get transaction count: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private createInputRequiredTask(taskId: string, userAddress: Address, message: string): Task {
    return {
      id: taskId,
      status: {
        state: 'input-required',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: message }],
        },
      },
    };
  }

  private createErrorTask(taskId: string, errorMessage: string): Task {
    return {
      id: taskId,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
        },
      },
    };
  }
} 