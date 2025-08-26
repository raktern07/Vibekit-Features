import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import cors from 'cors';
import * as dotenv from 'dotenv';
import express from 'express';
import { isAddress } from 'viem';
import { z } from 'zod';
import type { Task } from '@google-a2a/types';
import { TaskState } from '@google-a2a/types';

import { Agent } from './agent.js';

const PendleAgentSchema = z.object({
  instruction: z.string().describe('A natural-language directive for the Pendle agent.'),
  userAddress: z.string().describe('The user wallet address for external signing.'),
});
type PendleAgentArgs = z.infer<typeof PendleAgentSchema>;

dotenv.config();

const server = new McpServer({
  name: 'mcp-sse-agent-server',
  version: '1.0.0',
});

let agent: Agent;

const initializeAgent = async (): Promise<void> => {
  const quicknodeSubdomain = process.env.QUICKNODE_SUBDOMAIN;
  const apiKey = process.env.QUICKNODE_API_KEY;
  if (!quicknodeSubdomain || !apiKey) {
    throw new Error('QUICKNODE_SUBDOMAIN and QUICKNODE_API_KEY must be set in the .env file.');
  }

  agent = new Agent(quicknodeSubdomain, apiKey);
  await agent.init();
};

// Define tool name and description for clarity
const agentToolName = 'askYieldTokenizationAgent';
const agentToolDescription =
  'Sends a free-form, natural-language instruction to the yield trading agent via Ember MCP server, returning market information or a structured swap transaction plan. Example: "Swap 0.00001 wstETH to wstETH_YT via wstETH market on arbitrum one".';
server.tool(
  agentToolName,
  agentToolDescription,
  PendleAgentSchema.shape,
  async (args: PendleAgentArgs) => {
    if (!isAddress(args.userAddress)) {
      throw new Error('Invalid userAddress provided.');
    }
    try {
      const taskResponse = await agent.processUserInput(args.instruction, args.userAddress);

      console.error('[server.tool] result', taskResponse);

      return {
        content: [{ type: 'text', text: JSON.stringify(taskResponse) }],
      };
    } catch (error: unknown) {
      const err = error as Error;
      const errorTask: Task = {
        id: args.userAddress,
        contextId: `error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `Error: ${err.message}` }],
          },
        },
      };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(errorTask) }],
      };
    }
  }
);

const app = express();

app.use(cors());

app.get('/', (_req, res) => {
  res.json({
    name: 'MCP SSE Pendle Agent Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      '/': 'Server information (this response)',
      '/sse': 'Server-Sent Events endpoint for MCP connection',
      '/messages': 'POST endpoint for MCP messages',
      '/agent': 'POST endpoint for direct agent interaction (JSON body with instruction and userAddress)',
    },
    tools: [{ name: agentToolName, description: agentToolDescription }],
    capabilities: {
      markets: 'List available Pendle yield markets',
      swap: 'Generate swap transaction plans for Pendle tokens',
    },
    exampleRequest: {
      method: 'POST',
      url: '/agent',
      body: {
        instruction: 'List available Pendle yield markets',
        userAddress: '0x742d35Cc6634C0532925a3b8D6C3a3e3e2d7A681'
      }
    }
  });
});

const sseConnections = new Set();

let transport: SSEServerTransport;

app.get('/sse', async (_req, res) => {
  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);

  sseConnections.add(res);

  const keepaliveInterval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepaliveInterval);
      return;
    }
    res.write(':keepalive\n\n');
  }, 30000);

  _req.on('close', () => {
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });

  res.on('error', err => {
    console.error('SSE Error:', err);
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });
});

app.post('/messages', async (req, res) => {
  await transport.handlePostMessage(req, res);
});

// Direct agent endpoint for REST API calls
app.post('/agent', express.json(), async (req, res) => {
  try {
    const validationResult = PendleAgentSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid request body', 
        details: validationResult.error.errors 
      });
    }

    const { instruction, userAddress } = validationResult.data;

    // Validate address format
    if (!isAddress(userAddress)) {
      return res.status(400).json({
        success: false,
        error: 'userAddress must be a valid Ethereum address'
      });
    }

    console.error(`[Direct Agent] Processing request: "${instruction}" for ${userAddress}`);
    
    // Process the request with the agent - cast to proper type
    const taskResponse = await agent.processUserInput(instruction, userAddress as `0x${string}`);
    
    console.error('[Direct Agent] Response:', taskResponse);
    
    // Return the full task response
    res.json({
      success: true,
      data: taskResponse
    });
    
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[Direct Agent] Error:', err);
    
    const errorTask: Task = {
      id: req.body?.userAddress || 'unknown',
      contextId: `error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: `Error: ${err.message}` }],
        },
      },
    };
    
    res.status(500).json({
      success: false,
      error: err.message,
      data: errorTask
    });
  }
});

const PORT = 3003;
const main = async () => {
  try {
    await initializeAgent();
    app.listen(PORT, () => {
      console.error(`MCP SSE Agent Server running on port ${PORT}`);
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

main();

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  if (agent) {
    await agent.stop();
  }
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => shutdown(sig));
});