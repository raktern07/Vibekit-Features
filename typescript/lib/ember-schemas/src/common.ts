import { z } from 'zod';

//
// Common Transaction Schemas
//

// Define TokenIdentifierSchema for reuse across schemas
export const TokenIdentifierSchema = z.object({
  chainId: z.string().describe("Chain ID for the token, e.g., '1' for Ethereum mainnet."),
  address: z.string().describe("Contract address of the token."),
});
export type TokenIdentifier = z.infer<typeof TokenIdentifierSchema>;

export const TransactionPlanSchema = z.object({
  to: z.string().min(1, { message: "Transaction 'to' field is required and cannot be empty" }),
  data: z.string().min(1, { message: "Transaction 'data' field is required and cannot be empty" }),
  value: z.string().min(1, { message: "Transaction 'value' field is required and cannot be empty" }),
  chainId: z.string().min(1, { message: "Transaction 'chainId' field is required and cannot be empty" }),
});

// Schema for validating an array of transaction plans with at least one transaction
export const TransactionPlansSchema = z.array(TransactionPlanSchema)
  .min(1, { message: "Transaction plans array cannot be empty" });

export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;
export type TransactionPlans = z.infer<typeof TransactionPlansSchema>;

// Define TransactionArtifact type and schema creator
export type TransactionArtifact<T> = {
  txPreview: T;
  txPlan: Array<TransactionPlan>;
};

export function createTransactionArtifactSchema<T extends z.ZodTypeAny>(previewSchema: T) {
  return z.object({
    txPreview: previewSchema,
    txPlan: z.array(TransactionPlanSchema),
  });
}

//
// Common Tool Schemas
//

export const AskEncyclopediaSchema = z.object({
  question: z.string().describe('The question to ask the encyclopedia or informational tool.'),
});
export type AskEncyclopediaArgs = z.infer<typeof AskEncyclopediaSchema>;

//
// Utility Functions
//

// Utility function for MCP response validation
export function parseMcpToolResponse<T>(rawResponse: unknown, schema: z.ZodType<T>): T {
  if (typeof rawResponse !== 'object' || rawResponse === null) {
    throw new Error('MCP tool response is not an object');
  }

  let contentObj = rawResponse;

  // Handle text content wrapper
  const responseObj = rawResponse as Record<string, unknown>;
  if (
    'content' in responseObj &&
    Array.isArray(responseObj.content) &&
    responseObj.content.length > 0
  ) {
    const firstContent = responseObj.content[0];
    if (firstContent && typeof firstContent === 'object' && firstContent !== null && 'type' in firstContent && firstContent.type === 'text' && 'text' in firstContent) {
      try {
        // Try to parse the text content as JSON
        contentObj = JSON.parse((firstContent as Record<string, unknown>).text as string);
      } catch (error) {
        throw new Error(`Failed to parse JSON from MCP text content: ${error}`);
      }
    }
  }

  // Validate the parsed content against the provided schema
  try {
    return schema.parse(contentObj);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`MCP response validation failed: ${error.message}`);
    }
    throw error;
  }
} 