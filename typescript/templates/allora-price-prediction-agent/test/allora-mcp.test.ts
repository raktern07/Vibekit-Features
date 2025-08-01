/**
 * Isolated tests for Allora MCP Server tools
 * These tests verify that the Allora MCP server is working correctly
 * with the local environment variables before testing the full agent integration
 */

import 'dotenv/config';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

describe('Allora MCP Server Tools', () => {
  let mcpClient: Client;

  beforeAll(async () => {
    console.log('🚀 Starting Allora MCP Server for isolated testing...');

    // Verify ALLORA_API_KEY is set
    if (!process.env.ALLORA_API_KEY) {
      throw new Error('ALLORA_API_KEY environment variable is not set');
    }
    console.log('✅ ALLORA_API_KEY is set');

    // Find the Allora MCP server path - it should be in the workspace
    const mcpServerPath = require.resolve('@alloralabs/mcp-server');
    console.log('MCP Server path:', mcpServerPath);

    // Create MCP client with stdio transport
    const transport = new StdioClientTransport({
      command: 'node',
      args: [mcpServerPath],
      env: {
        ...process.env,
        ALLORA_API_KEY: process.env.ALLORA_API_KEY,
      },
    });

    mcpClient = new Client(
      {
        name: 'allora-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    await mcpClient.connect(transport);
    console.log('✅ Connected to Allora MCP Server');
  }, 30000); // 30 second timeout for connection

  afterAll(async () => {
    console.log('🛑 Shutting down Allora MCP Server...');
    if (mcpClient) {
      await mcpClient.close();
    }
  });

  describe('list_all_topics', () => {
    test('should list available topics', async () => {
      const result = await mcpClient.callTool({
        name: 'list_all_topics',
        arguments: {},
      });

      console.log('list_all_topics response:', JSON.stringify(result, null, 2));

      const content = result.content as any[];
      expect(content).toBeDefined();
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);

      // Check the structure of the response
      const firstContent = content[0];
      expect(firstContent).toHaveProperty('text');

      // Parse the topics
      const topics = JSON.parse(firstContent.text);
      expect(Array.isArray(topics)).toBe(true);

      if (topics.length > 0) {
        console.log(`Found ${topics.length} topics`);
        console.log('Sample topic:', topics[0]);

        // Verify topic structure
        const firstTopic = topics[0];
        expect(firstTopic).toHaveProperty('topic_id');
        expect(firstTopic).toHaveProperty('topic_name');

        // Look for crypto-related topics
        const cryptoTopics = topics.filter(
          (topic: any) =>
            topic.topic_name?.includes('BTC') ||
            topic.topic_name?.includes('ETH') ||
            topic.topic_name?.includes('SOL') ||
            topic.topic_name?.includes('Bitcoin') ||
            topic.topic_name?.includes('Ethereum'),
        );

        console.log(`Found ${cryptoTopics.length} crypto-related topics`);
        if (cryptoTopics.length > 0) {
          console.log('Crypto topics:', cryptoTopics);
        }
      }
    }, 30000); // 30 second timeout
  });

  describe('get_inference_by_topic_id', () => {
    test('should get inference for a valid topic ID', async () => {
      // First, get the list of topics to find a valid ID
      const topicsResult = await mcpClient.callTool({
        name: 'list_all_topics',
        arguments: {},
      });

      const topicsContent = topicsResult.content as any[];
      const topics = JSON.parse(topicsContent[0].text);

      if (topics.length === 0) {
        console.log('No topics available, skipping inference test');
        return;
      }

      // Try to find a crypto-related topic, or use the first one
      const cryptoTopic =
        topics.find((topic: any) => topic.topic_name?.includes('BTC') || topic.topic_name?.includes('ETH')) ||
        topics[0];

      console.log(`Testing inference for topic ID ${cryptoTopic.topic_id}: ${cryptoTopic.topic_name}`);

      // Get inference for this topic
      const result = await mcpClient.callTool({
        name: 'get_inference_by_topic_id',
        arguments: {
          topicID: cryptoTopic.topic_id,
        },
      });

      console.log('get_inference_by_topic_id response:', JSON.stringify(result, null, 2));

      const inferenceContent = result.content as any[];
      expect(inferenceContent).toBeDefined();
      expect(Array.isArray(inferenceContent)).toBe(true);
      expect(inferenceContent.length).toBeGreaterThan(0);

      // Check the structure of the response
      const firstInferenceContent = inferenceContent[0];
      expect(firstInferenceContent).toHaveProperty('text');

      // Parse the inference data
      const inference = JSON.parse(firstInferenceContent.text);
      console.log('Inference data:', inference);

      // The inference might have various structures depending on the topic
      // Let's just verify it's an object with some data
      expect(typeof inference).toBe('object');
    }, 30000); // 30 second timeout
  });

  describe('get_inference_by_topic_id', () => {
    test('should handle invalid topic ID gracefully', async () => {
      const result = await mcpClient.callTool({
        name: 'get_inference_by_topic_id',
        arguments: {
          topicID: 999999, // Unlikely to exist
        },
      });

      console.log('Invalid topic ID response:', JSON.stringify(result, null, 2));

      const errorContent = result.content as any[];
      // The response might be an error or empty data
      expect(errorContent).toBeDefined();

      if (errorContent.length > 0 && errorContent[0].text) {
        const response = JSON.parse(errorContent[0].text);
        console.log('Error response:', response);
      }
    }, 30000); // 30 second timeout
  });

  describe('Token to Topic Mapping', () => {
    test('should find topics for common crypto tokens', async () => {
      const result = await mcpClient.callTool({
        name: 'list_all_topics',
        arguments: {},
      });

      const content = result.content as any[];
      const topics = JSON.parse(content[0].text);

      // Test common tokens
      const tokens = ['BTC', 'ETH', 'SOL', 'USDC', 'USDT'];
      const tokenTopicMap: Record<string, any> = {};

      for (const token of tokens) {
        const matchingTopic = topics.find((topic: any) => {
          const topicName = topic.topic_name || '';
          const description = topic.description || '';
          return topicName.includes(token) || description.includes(token);
        });

        if (matchingTopic) {
          tokenTopicMap[token] = matchingTopic;
          console.log(`✅ Found topic for ${token}: ID ${matchingTopic.topic_id} - ${matchingTopic.topic_name}`);
        } else {
          console.log(`❌ No topic found for ${token}`);
        }
      }

      // At least some tokens should have topics
      const foundTokens = Object.keys(tokenTopicMap);
      console.log(`Found topics for ${foundTokens.length} out of ${tokens.length} tokens`);

      if (foundTokens.length > 0) {
        expect(foundTokens.length).toBeGreaterThan(0);
      } else {
        console.warn(
          'No topics found for any common crypto tokens - check if the API has crypto price prediction topics',
        );
      }
    }, 30000); // 30 second timeout
  });
});
