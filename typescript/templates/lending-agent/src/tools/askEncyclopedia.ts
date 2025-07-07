import type { VibkitToolDefinition, AgentContext } from 'arbitrum-vibekit-core';
import type { Task, Message, TaskState } from '@google-a2a/types/src/types.js';
import type { LendingAgentContext } from '../agent.js';
import { AskEncyclopediaSchema } from './schemas.js';
import { createTaskId } from './utils.js';

export const askEncyclopediaBase: VibkitToolDefinition<
  typeof AskEncyclopediaSchema,
  Task | Message,
  LendingAgentContext
> = {
  name: 'ask-encyclopedia',
  description:
    'Ask a question about Aave to retrieve specific information about the protocol using embedded documentation.',
  parameters: AskEncyclopediaSchema,
  execute: async (args, context) => {
    // Note: In the reference implementation, this doesn't use MCP
    // It uses OpenRouter to query against local documentation
    // For now, we'll return a simple message
    // TODO: Implement proper encyclopedia querying

    return {
      id: createTaskId(),
      contextId: `encyclopedia-${Date.now()}`,
      kind: 'task' as const,
      status: {
        state: 'completed' as TaskState,
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Encyclopedia feature not yet implemented. Question received: ${args.question}`,
            },
          ],
        },
      },
    } as unknown as Task;
  },
};
