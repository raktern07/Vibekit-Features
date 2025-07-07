import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  LendingGetCapabilitiesResponseSchema,
  type LendingGetCapabilitiesResponse,
  McpTextWrapperSchema,
  type TokenInfo,
  type LendingAgentCapability,
} from 'ember-schemas';
import * as fs from 'fs/promises';
import * as path from 'path';

const CACHE_FILE_PATH = '.cache/lending-capabilities.json';

export async function loadTokenMapFromMcp(
  mcpClient: Client
): Promise<Record<string, Array<TokenInfo>>> {
  const useCache = process.env.AGENT_CACHE_TOKENS === 'true';
  let capabilitiesResponse: LendingGetCapabilitiesResponse | undefined;

  // Try to load from cache first
  if (useCache) {
    try {
      await fs.access(CACHE_FILE_PATH);
      console.log('Loading lending capabilities from cache...');
      const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
      const parsedJson = JSON.parse(cachedData);
      const validationResult = LendingGetCapabilitiesResponseSchema.safeParse(parsedJson);
      if (validationResult.success) {
        capabilitiesResponse = validationResult.data;
        console.log('Cached capabilities loaded and validated successfully.');
      } else {
        console.error('Cached capabilities validation failed:', validationResult.error);
        console.log('Proceeding to fetch fresh capabilities...');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        console.log('Cache not found, fetching fresh capabilities...');
      } else {
        console.error('Error reading or parsing cache file:', error);
      }
    }
  }

  // Fetch from MCP if not cached
  if (!capabilitiesResponse) {
    console.log('Fetching lending capabilities via MCP tool call...');
    try {
      const mcpTimeoutMs = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || '30000', 10);
      console.log(`Using MCP tool timeout: ${mcpTimeoutMs}ms`);

      const capabilitiesResult = await mcpClient.callTool(
        {
          name: 'getCapabilities',
          arguments: { type: 'LENDING_MARKET' },
        },
        undefined,
        { timeout: mcpTimeoutMs }
      );

      console.log('Raw capabilitiesResult received from MCP tool call.');

      // Validate the MCP wrapper format
      const wrapperValidationResult = McpTextWrapperSchema.safeParse(capabilitiesResult);
      if (!wrapperValidationResult.success) {
        console.error(
          'MCP getCapabilities tool returned an unexpected structure:',
          wrapperValidationResult.error
        );
        throw new Error('MCP getCapabilities tool returned an unexpected structure.');
      }

      // Parse the nested JSON
      const jsonString = wrapperValidationResult.data.content[0]!.text;
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Failed to parse JSON from MCP response:', parseError);
        throw new Error(`Failed to parse nested JSON response from getCapabilities`);
      }

      // Validate the capabilities structure
      const capabilitiesValidationResult =
        LendingGetCapabilitiesResponseSchema.safeParse(parsedData);
      if (!capabilitiesValidationResult.success) {
        console.error(
          'Parsed MCP getCapabilities response validation failed:',
          capabilitiesValidationResult.error
        );
        throw new Error('Failed to validate the parsed capabilities data from MCP server.');
      }

      capabilitiesResponse = capabilitiesValidationResult.data;
      console.log(`Validated ${capabilitiesResponse.capabilities.length} capabilities.`);

      // Cache the response
      if (useCache) {
        try {
          await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
          await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(capabilitiesResponse, null, 2));
          console.log('Cached validated capabilities response to', CACHE_FILE_PATH);
        } catch (err) {
          console.error('Failed to cache capabilities response:', err);
        }
      }
    } catch (error) {
      console.error('Error calling getCapabilities tool or processing response:', error);
      // Return empty token map on error instead of throwing
      console.warn('Token map will be empty due to capability fetch error.');
      return {};
    }
  }

  // Build the token map from capabilities
  const tokenMap: Record<string, Array<TokenInfo>> = {};
  let loadedTokenCount = 0;

  if (capabilitiesResponse?.capabilities) {
    console.log(`Processing ${capabilitiesResponse.capabilities.length} capabilities entries...`);

    capabilitiesResponse.capabilities.forEach((capabilityEntry: LendingAgentCapability) => {
      if (capabilityEntry.lendingCapability) {
        const lendingCap = capabilityEntry.lendingCapability;
        const token = lendingCap.underlyingToken;

        if (token && token.symbol && token.tokenUid?.chainId && token.tokenUid?.address) {
          const symbol = token.symbol.toUpperCase(); // Normalize to uppercase
          const tokenInfo: TokenInfo = {
            chainId: token.tokenUid.chainId,
            address: token.tokenUid.address,
            decimals: token.decimals ?? 18,
          };

          if (!tokenMap[symbol]) {
            tokenMap[symbol] = [tokenInfo];
            loadedTokenCount++;
          } else {
            // Check if this token/chain combo already exists
            const exists = tokenMap[symbol].some(
              t =>
                t.chainId === tokenInfo.chainId &&
                t.address.toLowerCase() === tokenInfo.address.toLowerCase()
            );
            if (!exists) {
              tokenMap[symbol].push(tokenInfo);
            }
          }
        }
      }
    });

    console.log(
      `Finished processing capabilities. Found ${loadedTokenCount} unique token symbols.`
    );
  }

  if (Object.keys(tokenMap).length === 0) {
    console.warn('Warning: Token map is empty after processing capabilities.');
  } else {
    console.log('Available tokens:', Object.keys(tokenMap).join(', '));
  }

  return tokenMap;
}
