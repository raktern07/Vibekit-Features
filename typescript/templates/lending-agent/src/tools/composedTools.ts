import { withHooks } from './withHooks.js';
import { borrowBase } from './borrow.js';
import { repayBase } from './repay.js';
import { supplyBase } from './supply.js';
import { withdrawBase } from './withdraw.js';
import { getUserPositionsBase } from './getUserPositions.js';
import { askEncyclopediaBase } from './askEncyclopedia.js';
import {
  tokenResolutionHook,
  balanceCheckHook,
  responseParserHook,
  composeBeforeHooks,
} from './hooks.js';
import {
  ZodBorrowResponseSchema,
  ZodRepayResponseSchema,
  ZodSupplyResponseSchema,
  ZodWithdrawResponseSchema,
} from './schemas.js';
import type { AgentContext } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types/src/types.js';
import type { LendingAgentContext } from '../agent.js';
import type { TokenInfo } from './types.js';

// Type for args after token resolution
type ArgsWithResolvedToken = {
  tokenName: string;
  amount: string;
  resolvedToken: TokenInfo;
};

// Create a properly typed composed hook for token resolution + balance check
const tokenResolutionAndBalanceCheck = async (
  args: { tokenName: string; amount: string },
  context: AgentContext<LendingAgentContext, any>
): Promise<{ tokenName: string; amount: string } | Task | Message> => {
  // First apply token resolution
  const tokenResult = await tokenResolutionHook(args, context);

  // Check if it short-circuited
  if ('kind' in tokenResult && (tokenResult.kind === 'task' || tokenResult.kind === 'message')) {
    return tokenResult;
  }

  // Now apply balance check with the resolved token
  return balanceCheckHook(tokenResult, context);
};

// Compose borrow tool with token resolution and response parsing
export const borrow = withHooks(borrowBase, {
  before: tokenResolutionHook,
  after: async (result, context, args) =>
    responseParserHook(
      result,
      context,
      args as ArgsWithResolvedToken,
      ZodBorrowResponseSchema,
      'borrow'
    ),
});

// Compose repay tool with token resolution, balance check, and response parsing
export const repay = withHooks(repayBase, {
  before: tokenResolutionAndBalanceCheck,
  after: async (result, context, args) =>
    responseParserHook(
      result,
      context,
      args as ArgsWithResolvedToken,
      ZodRepayResponseSchema,
      'repay'
    ),
});

// Compose supply tool with token resolution, balance check, and response parsing
export const supply = withHooks(supplyBase, {
  before: tokenResolutionAndBalanceCheck,
  after: async (result, context, args) =>
    responseParserHook(
      result,
      context,
      args as ArgsWithResolvedToken,
      ZodSupplyResponseSchema,
      'supply'
    ),
});

// Compose withdraw tool with token resolution and response parsing
export const withdraw = withHooks(withdrawBase, {
  before: tokenResolutionHook,
  after: async (result, context, args) =>
    responseParserHook(
      result,
      context,
      args as ArgsWithResolvedToken,
      ZodWithdrawResponseSchema,
      'withdraw'
    ),
});

// getUserPositions and askEncyclopedia don't need hooks - they already return Task/Message
export const getUserPositions = getUserPositionsBase;
export const askEncyclopedia = askEncyclopediaBase;

// Export all composed tools as an array
export const composedLendingTools = [
  borrow,
  repay,
  supply,
  withdraw,
  getUserPositions,
  askEncyclopedia,
];
