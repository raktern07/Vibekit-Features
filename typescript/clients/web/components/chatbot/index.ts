export { ChatbotWidget } from './ChatbotWidget';
export { ChatbotProvider, createChatbotScript } from './ChatbotProvider';
export { ChatbotIntegration, useChatbotVisibility } from './ChatbotIntegration';

// Types for external usage
export interface ChatbotConfig {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  primaryColor?: string;
  borderRadius?: string;
  zIndex?: number;
  enabledAgents?: string[];
  projectId?: string;
  appName?: string;
  apiEndpoint?: string;
}

// Utility function to detect active agents based on environment
export function getActiveAgents(): string[] {
  // Return all agents that are defined in compose.yml and running
  return ['ember-aave', 'ember-camelot', 'ember-lp', 'allora-price-prediction-agent', 'ember-pendle'];
}

// Utility to create agent URL mappings for different environments
export function getAgentUrls(environment: 'development' | 'production' = 'development') {
  const baseUrls = {
    development: {
      'ember-aave': 'http://lending-agent-no-wallet:3001/sse',
      'ember-camelot': 'http://swapping-agent-no-wallet:3005/sse',
      'ember-lp': 'http://liquidity-agent-no-wallet:3002/sse',
      'allora-price-prediction-agent': 'http://allora-price-prediction-agent:3008/sse',
      'ember-pendle': 'http://pendle-agent:3003/sse',
    },
    production: {
      'ember-aave': 'http://lending-agent-no-wallet:3001/sse',
      'ember-camelot': 'http://swapping-agent-no-wallet:3005/sse',
      'ember-lp': 'http://liquidity-agent-no-wallet:3002/sse',
      'allora-price-prediction-agent': 'http://allora-price-prediction-agent:3008/sse',
      'ember-pendle': 'http://pendle-agent:3003/sse',
    }
  };
  
  return baseUrls[environment];
} 