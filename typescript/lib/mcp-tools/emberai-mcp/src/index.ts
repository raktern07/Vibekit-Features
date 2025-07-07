import EmberGrpcClient, {
  CapabilityType,
  OrderType,
  TokenIdentifier,
  GetLiquidityPoolsResponse,
  GetUserLiquidityPositionsResponse,
  SwapTokensRequest,
} from "@emberai/sdk-typescript";
// Use the high-level McpServer API
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import "dotenv/config";

// CapabilityType is a runtime enum (value), so export it normally
export { CapabilityType } from "@emberai/sdk-typescript";

// --- Define Zod Schemas ---
// Convert our Zod objects to schema objects for MCP

const swapTokensSchema = {
  fromTokenAddress: z
    .string()
    .describe("The contract address of the token to swap from."),
  fromTokenChainId: z
    .string()
    .describe("The chain ID where the fromToken contract resides."),
  toTokenAddress: z
    .string()
    .describe("The contract address of the token to swap to."),
  toTokenChainId: z
    .string()
    .describe("The chain ID where the toToken contract resides."),
  amount: z
    .string()
    .describe(
      "The amount of the fromToken to swap (atomic, non-human readable format)."
    ),
  userAddress: z.string().describe("The wallet address initiating the swap."),
};

const borrowSchema = {
  tokenAddress: z
    .string()
    .describe("The contract address of the token to borrow."),
  tokenChainId: z
    .string()
    .describe("The chain ID where the token contract resides."),
  amount: z
    .string()
    .describe("The amount to borrow (human readable format expected by SDK)."),
  userAddress: z.string().describe("The wallet address initiating the borrow."),
};

const repaySchema = {
  tokenAddress: z
    .string()
    .describe("The contract address of the token to repay."),
  tokenChainId: z
    .string()
    .describe("The chain ID where the token contract resides."),
  amount: z.string().describe("The amount to repay (-human readable format)."),
  userAddress: z
    .string()
    .describe("The wallet address initiating the repayment."),
};

const supplySchema = {
  tokenAddress: z
    .string()
    .describe("The contract address of the token to supply."),
  tokenChainId: z
    .string()
    .describe("The chain ID where the token contract resides."),
  amount: z.string().describe("The amount to supply (human readable format)."),
  userAddress: z.string().describe("The supplier's wallet address."),
};

const withdrawSchema = {
  tokenAddress: z
    .string()
    .describe("The contract address of the token to withdraw."),
  tokenChainId: z
    .string()
    .describe("The chain ID where the token contract resides."),
  amount: z
    .string()
    .describe("The amount to withdraw (human readable format)."),
  userAddress: z.string().describe("The lender's wallet address."),
};

const getCapabilitiesSchema = {
  type: z
    .nativeEnum(CapabilityType)
    .describe("The type of capabilities to get."),
};

const getUserPositionsSchema = {
  userAddress: z
    .string()
    .describe("The wallet address to fetch positions for."),
};

const getTokensSchema = {
  chainId: z.string().describe("The chain ID to get tokens for.").optional(),
  filter: z.string().describe("A filter to apply to the tokens.").optional(),
};

const supplyLiquiditySchema = {
  token0Address: z
    .string()
    .describe("The contract address of the first token in the pair (token0)."),
  token0ChainId: z
    .string()
    .describe("The chain ID where the token0 contract resides."),
  token1Address: z
    .string()
    .describe("The contract address of the second token in the pair (token1)."),
  token1ChainId: z
    .string()
    .describe("The chain ID where the token1 contract resides."),
  amount0: z
    .string()
    .describe("The amount of token0 to supply (human-readable format)."),
  amount1: z
    .string()
    .describe("The amount of token1 to supply (human-readable format)."),
  priceFrom: z
    .string()
    .describe(
      "The lower bound price for the liquidity range (human-readable format)."
    ),
  priceTo: z
    .string()
    .describe(
      "The upper bound price for the liquidity range (human-readable format)."
    ),
  userAddress: z
    .string()
    .describe("The wallet address supplying the liquidity."),
};

const withdrawLiquiditySchema = {
  tokenId: z
    .string()
    .describe(
      "The NFT token ID representing the liquidity position to withdraw."
    ),
  providerId: z
    .string()
    .describe(
      "The ID of the liquidity provider protocol (e.g., 'uniswap_v3'). Usually obtained from the getUserLiquidityPositions tool."
    ),
  userAddress: z
    .string()
    .describe("The wallet address withdrawing the liquidity."),
};

const getLiquidityPoolsSchema = {
  // No parameters currently needed, but could add filters later (e.g., chainId)
};

const getUserLiquidityPositionsSchema = {
  userAddress: z
    .string()
    .describe("The wallet address to fetch liquidity positions for."),
};

// Add schema definition for getYieldMarkets after the existing schema definitions
const getYieldMarketsSchema = {};

const getWalletBalancesSchema = {
  walletAddress: z
    .string()
    .describe("The wallet address to fetch token balances for."),
};

const getMarketDataSchema = {
  tokenAddress: z
    .string()
    .describe("The contract address of the token to get market data for."),
  tokenChainId: z
    .string()
    .describe("The chain ID where the token contract resides."),
};

// Define types from schemas using z.object() on the raw schema definitions
type SwapTokensParams = z.infer<ReturnType<typeof z.object<typeof swapTokensSchema>>>;
type BorrowParams = z.infer<ReturnType<typeof z.object<typeof borrowSchema>>>;
type RepayParams = z.infer<ReturnType<typeof z.object<typeof repaySchema>>>;
type SupplyParams = z.infer<ReturnType<typeof z.object<typeof supplySchema>>>;
type WithdrawParams = z.infer<ReturnType<typeof z.object<typeof withdrawSchema>>>;
type GetCapabilitiesParams = z.infer<ReturnType<typeof z.object<typeof getCapabilitiesSchema>>>;
type GetUserPositionsParams = z.infer<ReturnType<typeof z.object<typeof getUserPositionsSchema>>>;
type GetTokensParams = z.infer<ReturnType<typeof z.object<typeof getTokensSchema>>>;
type SupplyLiquidityParams = z.infer<ReturnType<typeof z.object<typeof supplyLiquiditySchema>>>;
type WithdrawLiquidityParams = z.infer<ReturnType<typeof z.object<typeof withdrawLiquiditySchema>>>;
type GetLiquidityPoolsParams = z.infer<ReturnType<typeof z.object<typeof getLiquidityPoolsSchema>>>;
type GetUserLiquidityPositionsParams = z.infer<ReturnType<typeof z.object<typeof getUserLiquidityPositionsSchema>>>;
type GetYieldMarketsParams = z.infer<ReturnType<typeof z.object<typeof getYieldMarketsSchema>>>;
type GetWalletBalancesParams = z.infer<ReturnType<typeof z.object<typeof getWalletBalancesSchema>>>;
type GetMarketDataParams = z.infer<ReturnType<typeof z.object<typeof getMarketDataSchema>>>;

// --- Initialize the MCP server using the high-level McpServer API
const server = new McpServer({
  name: "ember-mcp-tool-server",
  version: "1.0.0",
});

// Read endpoint from environment variable or use default
const defaultEndpoint = "grpc.api.emberai.xyz:50051";
const emberEndpoint = process.env.EMBER_ENDPOINT || defaultEndpoint;

if (emberEndpoint === defaultEndpoint) {
  console.error(
    `Using default Ember endpoint: ${defaultEndpoint}. Set EMBER_ENDPOINT env var to override.`
  );
} else {
  console.error(
    `Using Ember endpoint from EMBER_ENDPOINT env var: ${emberEndpoint}`
  );
}

const emberClient = new EmberGrpcClient(emberEndpoint);
// --- Register Tools ---
// Pass the raw schema (e.g., swapTokensSchema) instead of the validator instance
server.tool(
  "swapTokens",
  "Swap or convert tokens using Ember On-chain Actions",
  swapTokensSchema,
  async (params: SwapTokensParams) => {
    const swapRequest: SwapTokensRequest = {
      orderType: OrderType.MARKET_SELL,
      baseToken: {
        chainId: params.fromTokenChainId,
        address: params.fromTokenAddress,
      },
      quoteToken: {
        chainId: params.toTokenChainId,
        address: params.toTokenAddress,
      },
      amount: params.amount,
      recipient: params.userAddress,
      slippageTolerance: "0.75",
    };

    try {
      const response = await emberClient.swapTokens(swapRequest);
      if (
        response.error ||
        !response.transactions ||
        !response.transactions.length
      ) {
        throw new Error(
          response.error?.message || "No transaction plan returned for swap"
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...response,
                transactions: response.transactions.map((tx) => ({
                  ...tx,
                  chainId: response.chainId,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error(`Swap tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "borrow",
  "Borrow tokens using Ember On-chain Actions",
  borrowSchema,
  async (params: BorrowParams) => {
    console.error(`Executing borrow tool with params:`, params);

    try {
      const response = await emberClient.borrowTokens({
        tokenUid: {
          chainId: params.tokenChainId,
          address: params.tokenAddress,
        },
        amount: params.amount,
        borrowerWalletAddress: params.userAddress,
      });

      if (response.error || !response.transactions) {
        throw new Error(
          response.error?.message || "No transaction plan returned for borrow"
        );
      }

      console.error(
        `Borrow tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...response,
                transactions: response.transactions.map((tx) => ({
                  ...tx,
                  chainId: response.chainId,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error(`Borrow tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "repay",
  "Repay borrowed tokens using Ember On-chain Actions",
  repaySchema,
  async (params: RepayParams) => {
    console.error(`Executing repay tool with params:`, params);

    try {
      const response = await emberClient.repayTokens({
        tokenUid: {
          chainId: params.tokenChainId,
          address: params.tokenAddress,
        },
        amount: params.amount,
        borrowerWalletAddress: params.userAddress,
      });

      if (response.error || !response.transactions) {
        throw new Error(
          response.error?.message || "No transaction plan returned for repay"
        );
      }

      console.error(`Repay tool success. Transactions:`, response.transactions);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...response,
                transactions: response.transactions.map((tx) => ({
                  ...tx,
                  chainId: response.chainId,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error(`Repay tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "supply",
  "Supply tokens using Ember On-chain Actions",
  supplySchema,
  async (params: SupplyParams) => {
    console.error(`Executing supply tool with params:`, params);

    try {
      const response = await emberClient.supplyTokens({
        tokenUid: {
          chainId: params.tokenChainId,
          address: params.tokenAddress,
        },
        amount: params.amount,
        supplierWalletAddress: params.userAddress,
      });

      if (response.error || !response.transactions) {
        throw new Error(
          response.error?.message || "No transaction plan returned for supply"
        );
      }

      console.error(
        `Supply tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...response,
                transactions: response.transactions.map((tx) => ({
                  ...tx,
                  chainId: response.chainId,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error(`Supply tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "withdraw",
  "Withdraw tokens using Ember On-chain Actions",
  withdrawSchema,
  async (params: WithdrawParams) => {
    console.error(`Executing withdraw tool with params:`, params);

    try {
      const response = await emberClient.withdrawTokens({
        tokenUid: {
          chainId: params.tokenChainId,
          address: params.tokenAddress,
        },
        amount: params.amount,
        lenderWalletAddress: params.userAddress,
      });

      if (response.error || !response.transactions) {
        throw new Error(
          response.error?.message || "No transaction plan returned for withdraw"
        );
      }

      console.error(
        `Withdraw tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...response,
                transactions: response.transactions.map((tx) => ({
                  ...tx,
                  chainId: response.chainId,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error(`Withdraw tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "getCapabilities",
  "Get Ember On-chain Actions capabilities",
  getCapabilitiesSchema,
  async (params: GetCapabilitiesParams) => {
    console.error(`Executing getCapabilities tool with params:`, params);

    try {
      const response = await emberClient.getCapabilities({ type: params.type });

      console.error(`GetCapabilities tool success.`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      console.error(`GetCapabilities tool error:`, error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${(error as Error).message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getUserPositions",
  "Get user wallet positions using Ember On-chain Actions",
  getUserPositionsSchema,
  async (params: GetUserPositionsParams) => {
    console.error(`Executing getUserPositions tool with params:`, params);

    try {
      const response = await emberClient.getWalletPositions({
        walletAddress: params.userAddress,
      });

      console.error(`GetUserPositions tool success.`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      console.error(`GetUserPositions tool error:`, error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${(error as Error).message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getTokens",
  "Get a list of supported tokens using Ember On-chain Actions",
  getTokensSchema,
  async (params: GetTokensParams) => {
    console.error(`Executing getTokens tool with params:`, params);

    try {
      const response = await emberClient.getTokens({
        chainId: params.chainId ?? "",
        filter: params.filter ?? "",
      });
      console.error(`GetTokens tool success.`);
      return { content: [{ type: "text", text: JSON.stringify(response) }] };
    } catch (error) {
      console.error(`GetTokens tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "supplyLiquidity",
  "Supply liquidity to a token pair using Ember On-chain Actions.",
  supplyLiquiditySchema,
  async (params: SupplyLiquidityParams) => {
    console.error(`Executing supplyLiquidity tool with params:`, params);

    try {
      const token0: TokenIdentifier = {
        chainId: params.token0ChainId,
        address: params.token0Address,
      };
      const token1: TokenIdentifier = {
        chainId: params.token1ChainId,
        address: params.token1Address,
      };

      const response = await emberClient.supplyLiquidity({
        token0: token0,
        token1: token1,
        amount0: params.amount0,
        amount1: params.amount1,
        // Assuming limited range supply as per agent example
        // TODO: Consider adding a 'fullRange' boolean parameter to the schema?
        fullRange: false,
        limitedRange: {
          minPrice: params.priceFrom,
          maxPrice: params.priceTo,
        },
        supplierAddress: params.userAddress,
      });

      // Adjusted error check: Rely on try/catch for gRPC errors,
      // check for presence of expected data (transactions)
      if (!response.transactions || response.transactions.length === 0) {
        throw new Error(
          // response.error?.message || // Removed direct error check
          "No transaction plan returned for supplyLiquidity"
        );
      }

      console.error(
        `SupplyLiquidity tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            // Return the transaction plan for the client to execute
            text: JSON.stringify(
              {
                ...response,
                transactions: response.transactions.map((tx) => ({
                  ...tx,
                  chainId: response.chainId,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error(`SupplyLiquidity tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "withdrawLiquidity",
  "Withdraw liquidity from a position using Ember On-chain Actions.",
  withdrawLiquiditySchema,
  async (params: WithdrawLiquidityParams) => {
    console.error(`Executing withdrawLiquidity tool with params:`, params);

    try {
      const response = await emberClient.withdrawLiquidity({
        tokenId: params.tokenId,
        providerId: params.providerId,
        supplierAddress: params.userAddress,
      });

      // Adjusted error check: Rely on try/catch for gRPC errors,
      // check for presence of expected data (transactions)
      if (!response.transactions || response.transactions.length === 0) {
        throw new Error(
          // response.error?.message || // Removed direct error check
          "No transaction plan returned for withdrawLiquidity"
        );
      }

      console.error(
        `WithdrawLiquidity tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            // Return the transaction plan for the client to execute
            text: JSON.stringify(
              {
                ...response,
                transactions: response.transactions.map((tx) => ({
                  ...tx,
                  chainId: response.chainId,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error(`WithdrawLiquidity tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "getLiquidityPools",
  "Get a list of available liquidity pools using Ember On-chain Actions.",
  getLiquidityPoolsSchema,
  async (params: GetLiquidityPoolsParams) => {
    console.error(`Executing getLiquidityPools tool with params:`, params);
    try {
      // Pass undefined if no args/metadata needed
      const response: GetLiquidityPoolsResponse =
        await emberClient.getLiquidityPools(undefined);

      // Check for expected data instead of response.error
      if (!response.liquidityPools) {
        throw new Error("No liquidity pools data returned.");
      }

      console.error(`getLiquidityPools tool success.`);
      return {
        content: [
          {
            type: "text",
            // Pass the whole response object as JSON
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      console.error(`getLiquidityPools tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "getUserLiquidityPositions",
  "Get user's liquidity positions using Ember On-chain Actions.",
  getUserLiquidityPositionsSchema,
  async (params: GetUserLiquidityPositionsParams) => {
    console.error(
      `Executing getUserLiquidityPositions tool with params:`,
      params
    );

    try {
      // Use correct argument name: supplierAddress
      const response: GetUserLiquidityPositionsResponse =
        await emberClient.getUserLiquidityPositions({
          supplierAddress: params.userAddress,
        });

      // Check for expected data instead of response.error
      if (!response.positions) {
        throw new Error("No user liquidity positions data returned.");
      }

      console.error(`getUserLiquidityPositions tool success.`);
      return {
        content: [
          {
            type: "text",
            // Pass the whole response object as JSON
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      console.error(`getUserLiquidityPositions tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

// Add getYieldMarkets tool implementation after the getTokens implementation
server.tool(
  "getYieldMarkets",
  "Get Yield markets",
  getYieldMarketsSchema,
  async (params: GetYieldMarketsParams) => {
    console.error(`Executing getYieldMarkets tool with params:`, params);

    try {
      const response = await emberClient.getYieldMarkets({
        chainIds: [],
      });
      console.error(`GetYieldMarkets tool success.`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`GetYieldMarkets tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "getWalletBalances",
  "Get wallet token balances using Ember On-chain Actions",
  getWalletBalancesSchema,
  async (params: GetWalletBalancesParams) => {
    console.error(`Executing getWalletBalances tool with params:`, params);

    try {
      const response = await emberClient.getWalletBalances({
        walletAddress: params.walletAddress,
      });
      
      // Check for expected data instead of response.error
      if (!response.balances) {
        throw new Error("No wallet balances data returned.");
      }

      console.error(`GetWalletBalances tool success.`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`GetWalletBalances tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "getMarketData",
  "Get live market data for a token using Ember On-chain Actions",
  getMarketDataSchema,
  async (params: GetMarketDataParams) => {
    console.error(`Executing getMarketData tool with params:`, params);

    try {
      const response = await emberClient.getMarketData({
        tokenUid: {
          chainId: params.tokenChainId,
          address: params.tokenAddress,
        },
      });

      console.error(`GetMarketData tool success.`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`GetMarketData tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

// --- Connect Transport and Start Server ---
async function main() {
  // Use Stdio transport for communication
  const transport = new StdioServerTransport();

  try {
    // Add log message to monitor transport communication
    console.error("Initializing transport...");

    // Connect the server to the transport
    await server.connect(transport);
    console.error("Ember MCP stdio server started and connected.");

    // Special logging to help transport debugging
    console.error("Server is now ready to receive requests.");
  } catch (error) {
    console.error("Failed to start or connect the MCP server:", error);
    process.exit(1);
  }

  // Graceful shutdown
  const cleanup = async () => {
    console.error("Shutting down Ember MCP stdio server...");
    let exitCode = 0;
    try {
      if (emberClient) {
        // If emberClient.close() is synchronous and starts the closing process:
        emberClient.close(); 
        console.error("Ember gRPC client close initiated.");
        // Add a small delay to allow gRPC to start closing connections, if necessary.
        // This is a bit of a workaround; ideally, the SDK would provide a promise for full closure.
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
        console.error("Assumed Ember gRPC client had time to process close.");
      }
      if (server) {
        await server.close(); // McpServer should have a close method that returns a Promise
        console.error("MCP server closed.");
      }
    } catch (err) {
      console.error("Error during shutdown:", err);
      exitCode = 1;
    } finally {
      console.error(`Exiting Ember MCP stdio server with code ${exitCode}.`);
      process.exit(exitCode);
    }
  };

  process.on("SIGINT", async () => {
    console.error("Received SIGINT.");
    await cleanup();
  });
  process.on("SIGTERM", async () => {
    console.error("Received SIGTERM.");
    await cleanup();
  });
  process.on("SIGUSR2", async () => { // For nodemon restarts
    console.error("Received SIGUSR2.");
    await cleanup();
  });
}

// Run the server
main();

// Export server instance and helper to close it programmatically (useful for tests)
export { server };

export async function closeServer() {
  try {
    await server.close();
  } catch (e) {
    console.error("Error while closing Ember MCP server via closeServer():", e);
  }
}

// Graceful shutdown on process signals
process.on("SIGINT", async () => {
  console.error("Received SIGINT, shutting down MCP server");
  try {
    await server.close();
  } catch (e) {
    console.error("Error closing MCP server:", e);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Received SIGTERM, shutting down MCP server");
  try {
    await server.close();
  } catch (e) {
    console.error("Error closing MCP server:", e);
  }
  process.exit(0);
});
