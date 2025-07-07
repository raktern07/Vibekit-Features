import type { Task } from 'a2a-samples-js';
import { GetMarketDataResponseSchema, type GetMarketDataResponse } from 'ember-schemas';

/**
 * Parse data from an agent's function call response
 * @param functionCall The function call from the agent's response
 * @returns Parsed arguments object
 */
export function parseFunctionCallArgs(functionCall: {
  name: string;
  arguments: string;
}): Record<string, unknown> {
  try {
    return JSON.parse(functionCall.arguments || '{}');
  } catch (error) {
    console.error('Error parsing function arguments:', error);
    return {};
  }
}

/**
 * Extract text message from agent response
 * @param response The agent response object
 * @returns The text message from the response
 */
export function extractMessageText(response: Task): string {
  if (response?.status?.message?.parts) {
    for (const part of response.status.message.parts) {
      if (part.type === 'text') {
        return part.text || '';
      }
    }
  }
  return '';
}


export function extractTokenMarketData(response: Task): GetMarketDataResponse {
  if (!response.artifacts) {
    throw new Error('No artifacts found in response');
  }

  for (const artifact of response.artifacts) {
    if (artifact.name === 'token-market-data') {
      for (const part of artifact.parts) {
        if (part.type === 'data' && part.data) {
          const parseResult = GetMarketDataResponseSchema.safeParse(part.data);
          
          if (!parseResult.success) {
            throw new Error(`Invalid market data format: ${parseResult.error.message}`);
          }
          
          return parseResult.data;
        }
      }
    }
  }

  throw new Error('No token market data found in artifacts');
} 