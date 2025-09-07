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
      'ember-aave': 'https://lending-agent.xcan.dev',
      'ember-camelot': 'https://swapping-agent.xcan.dev',
      'ember-lp': 'https://liquidity-agent.xcan.dev',
      'ember-pendle': 'https://pendle-agent.xcan.dev',
    },
    production: {
      'ember-aave': 'https://lending-agent.xcan.dev',
      'ember-camelot': 'https://swapping-agent.xcan.dev',
      'ember-lp': 'https://liquidity-agent.xcan.dev',
      'ember-pendle': 'https://pendle-agent.xcan.dev',
    }
  };
  
  return baseUrls[environment];
} 