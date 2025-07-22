'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { X, MessageCircle, Send, Bot, Wallet, Edit2, Check, XCircle, ChevronDown, Trash } from 'lucide-react';
import { chatAgents, DEFAULT_SERVER_URLS } from '../../agents-config';
import { generateUUID } from '@/lib/utils';
import { saveChatAgentAsCookie } from '@/app/(chat)/actions';
import { MessageRenderer } from '../message.renderer';
import { TransactionPreview } from './TransactionPreview';
import { Markdown } from '../markdown';
import type { Message, UIMessage } from 'ai';

// Global CSS fix for chatbot transaction previews and text visibility
const chatbotStyles = `
  .chatbot-widget .transaction-preview {
    background: white !important;
    color: #1f2937 !important;
  }
  .chatbot-widget .transaction-preview * {
    color: #1f2937 !important;
  }
  .chatbot-widget .transaction-preview button {
    background: #0ea5e9 !important;
    color: white !important;
  }
  .chatbot-widget .transaction-preview .text-white {
    color: white !important;
  }
  .chatbot-widget .transaction-preview .bg-zinc-700 {
    background-color: #374151 !important;
    color: white !important;
  }
  .chatbot-widget .chatbot-message-content {
    color: #1f2937 !important;
  }
  .chatbot-widget .chatbot-message-content * {
    color: #1f2937 !important;
  }
  .chatbot-widget .transaction-preview-wrapper * {
    color: #1f2937 !important;
  }
  .chatbot-widget .transaction-preview-wrapper button {
    background: #0ea5e9 !important;
    color: white !important;
  }
  .chatbot-widget .transaction-preview-wrapper .text-white {
    color: white !important;
  }
  .chatbot-widget .transaction-preview {
    overflow-wrap: break-word !important;
    word-break: break-all !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
  }
  .chatbot-widget .transaction-preview .bg-zinc-700 {
    overflow-wrap: break-word !important;
    word-break: break-all !important;
    white-space: pre-wrap !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
  }
  .chatbot-widget .transaction-preview * {
    overflow-wrap: break-word !important;
    word-break: break-all !important;
    max-width: 100% !important;
  }
  .chatbot-widget .bg-zinc-700 {
    overflow-wrap: break-word !important;
    word-break: break-all !important;
    white-space: pre-wrap !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
  }
  .chatbot-widget .chatbot-transaction-address {
    overflow-wrap: break-word !important;
    word-break: break-all !important;
    font-family: monospace !important;
    font-size: 0.75rem !important;
    background: #f3f4f6 !important;
    padding: 0.25rem !important;
    border-radius: 0.25rem !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
  }
  .chatbot-transaction-preview * {
    max-width: 100% !important;
    overflow-wrap: break-word !important;
    word-break: break-all !important;
  }
`;

interface ChatbotWidgetProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  primaryColor?: string;
  borderRadius?: string;
  zIndex?: number;
  enabledAgents?: string[];
}

export function ChatbotWidget({
  position = 'bottom-right',
  primaryColor = '#0ea5e9',
  borderRadius = '12px',
  zIndex = 9999,
  enabledAgents = ['ember-aave', 'ember-camelot', 'ember-counter']
}: ChatbotWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('ember-counter');
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // Tooltip state with delay
  const tooltipTimeout = useRef<number | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const { address, isConnected } = useAccount();

  // Generate a stable UUID for this chatbot session
  const chatId = useMemo(() => generateUUID(), []);

  // Filter agents based on what's actually running
  const availableAgents = chatAgents.filter(agent =>
    enabledAgents.includes(agent.id) || agent.id === 'all'
  );

  // Use the exact same pattern as the main Chat component
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, reload } = useChat({
    id: chatId,
    body: {
      id: chatId,
      selectedChatModel: 'meta-llama/llama-3.1-70b-instruct',
      context: {
        walletAddress: address,
      },
    },
    initialMessages: [],
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onError: () => {
      console.error('🚨 [CHATBOT] Chat error occurred');
      setIsSubmitting(false);
    },
    onFinish: () => {
      console.log('✅ [CHATBOT] Chat finished successfully');
      setIsSubmitting(false);
    },
  });

  const positionStyles = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4'
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Set the initial agent cookie when component mounts
  useEffect(() => {
    // Force set the agent cookie immediately
    console.log('🎯 [CHATBOT] Setting agent cookie to:', selectedAgent);
    saveChatAgentAsCookie(selectedAgent);

    // Also save it with a small delay to ensure it takes effect
    setTimeout(() => {
      console.log('🎯 [CHATBOT] Re-setting agent cookie to:', selectedAgent);
      saveChatAgentAsCookie(selectedAgent);
    }, 100);
  }, []);

  // Clear submitting state when assistant starts responding
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content) {
        setIsSubmitting(false);
      }
    }
  }, [messages]);

  const handleSuggestedAction = (action: string) => {
    const syntheticEvent = {
      preventDefault: () => { },
    } as React.FormEvent<HTMLFormElement>;

    // Set input value and submit
    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.value = action;
      handleInputChange({ target: { value: action } } as React.ChangeEvent<HTMLInputElement>);

      // Set submitting state immediately
      setIsSubmitting(true);

      // Submit with a slight delay to ensure state updates
      setTimeout(() => {
        handleSubmit(syntheticEvent);
      }, 100);
    }
  };

  const handleEditMessage = (messageId: string, currentText: string) => {
    setEditingMessageId(messageId);
    setEditingText(currentText);
  };

  const handleSaveEdit = (messageId: string) => {
    if (!editingText.trim()) return;

    // Update the message in the messages array
    const updatedMessages = messages.map((msg: UIMessage) => {
      if (msg.id === messageId) {
        return {
          ...msg,
          content: editingText,
          parts: [{ type: 'text' as const, text: editingText }]
        };
      }
      return msg;
    });

    setMessages(updatedMessages);
    setEditingMessageId(null);
    setEditingText('');

    // Reload the conversation to get new response
    setTimeout(() => {
      reload();
    }, 100);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setIsSubmitting(true);
    handleSubmit(e);
  };

  const selectedAgentData = availableAgents.find(agent => agent.id === selectedAgent);

  // Inject custom styles for transaction previews
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = chatbotStyles;
    document.head.appendChild(styleElement);

    return () => {
      if (document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);

  // Tooltip state with delay
  const handleTooltipShow = () => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    tooltipTimeout.current = window.setTimeout(() => setShowTooltip(true), 150);
  };
  const handleTooltipHide = () => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    tooltipTimeout.current = window.setTimeout(() => setShowTooltip(false), 100); 
  };

  return (
    <div
      className={`fixed ${positionStyles[position]} font-sans chatbot-widget`}
      style={{ zIndex }}
    >
      {/* Chat Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-full p-4 group border border-gray-200"
          style={{
            backgroundColor: primaryColor,
            borderRadius: borderRadius,
          }}
        >
          <MessageCircle className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="bg-white shadow-2xl border border-gray-200 flex flex-col chatbot-container"
          style={{
            borderRadius: borderRadius,
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-4 text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="flex items-center gap-3">
              <Bot className="w-6 h-6" />
              <div>
                <h3 className="font-semibold text-lg">Vibekit AI</h3>
                <p className="text-sm opacity-90">DeFi Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onMouseEnter={handleTooltipShow}
                  onMouseLeave={handleTooltipHide}
                  onFocus={handleTooltipShow}
                  onBlur={handleTooltipHide}
                  onClick={() => setShowClearConfirm(true)}
                  className="hover:bg-white/30 focus:bg-white/30 p-1 rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-red-400 group"
                  title="Clear conversation"
                  tabIndex={0}
                  aria-label="Clear conversation"
                >
                  <Trash className="w-5 h-5 text-white group-hover:text-red-200 group-focus:text-red-200 transition-colors duration-150" />
                </button>
                {showTooltip && (
                  <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow-lg z-50 animate-fade-in flex flex-col items-center min-w-max">
                    <span>Clear conversation</span>
                    <span className="w-2 h-2 bg-gray-800 rotate-45 mt-[-4px]" style={{ marginTop: '-4px' }}></span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Wallet Connection Status */}
          {!isConnected && (
            <div className="bg-yellow-50 border-b border-yellow-200 p-3">
              <div className="flex items-center gap-2 text-yellow-800 text-sm">
                <Wallet className="w-4 h-4" />
                <span>Connect wallet for full functionality</span>
              </div>
              <div className="mt-2">
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      onClick={openConnectModal}
                      className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 transition-colors"
                    >
                      Connect Wallet
                    </button>
                  )}
                </ConnectButton.Custom>
              </div>
            </div>
          )}

          {/* Agent Selector */}
          <div className="border-b border-gray-200 p-3 relative">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-700">Active Agent:</span>
              <div className="relative">
                <button
                  onClick={() => setShowAgentSelector(!showAgentSelector)}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-gray-300 hover:border-gray-400 transition-all duration-200 bg-white text-gray-800 shadow-sm hover:shadow-md min-w-[140px] justify-between"
                  style={{ boxShadow: showAgentSelector ? '0 4px 24px rgba(0,0,0,0.10)' : undefined }}
                >
                  <span className="font-medium">{selectedAgentData?.name || 'All Agents'}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${showAgentSelector ? 'rotate-180' : ''}`}
                  />
                </button>
                <div
                  className={`absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden transition-all duration-200 ${showAgentSelector ? 'opacity-100 translate-y-0 max-h-64' : 'opacity-0 -translate-y-2 max-h-0 pointer-events-none'
                    }`}
                  style={{ minWidth: 180 }}
                >
                  <div className="py-1 max-h-60 overflow-y-auto">
                    {availableAgents.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => {
                          setSelectedAgent(agent.id);
                          setShowAgentSelector(false);
                          saveChatAgentAsCookie(agent.id);
                          setTimeout(() => saveChatAgentAsCookie(agent.id), 50);
                        }}
                        className={`w-full text-left px-4 py-3 text-base transition-all duration-150 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${selectedAgent === agent.id
                          ? 'bg-blue-100 text-blue-700 border-blue-200 font-semibold'
                          : 'text-gray-800'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{agent.name}</div>
                            <div className="text-xs opacity-75 mt-1">{agent.description}</div>
                          </div>
                          {selectedAgent === agent.id && (
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 ? (
              <div className="space-y-4">
                {/* Welcome Message */}
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <div className="flex items-start gap-3">
                    <Bot className="w-8 h-8 text-blue-500 mt-1" />
                    <div>
                      <p className="text-gray-800 font-medium mb-2">
                        Welcome to Vibekit AI! 👋
                      </p>
                      <p className="text-gray-600 text-sm">
                        I can help you with DeFi operations like lending, trading, and more.
                        {!isConnected && ' Connect your wallet to get started!'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Suggested Actions */}
                {selectedAgentData?.suggestedActions && selectedAgentData.suggestedActions.length > 0 && (
                  <div className="bg-white p-4 rounded-lg shadow-sm border">
                    <h4 className="font-medium text-gray-800 mb-3">Suggested Actions:</h4>
                    <div className="space-y-2">
                      {selectedAgentData.suggestedActions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestedAction(suggestion.action)}
                          className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border"
                        >
                          <div className="font-medium text-sm text-gray-800">
                            {suggestion.title}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {suggestion.label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available Agents */}
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <h4 className="font-medium text-gray-800 mb-3">Available Agents:</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {availableAgents.filter(agent => agent.id !== 'all').map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => setSelectedAgent(agent.id)}
                        className={`p-3 rounded-lg border transition-colors text-left ${selectedAgent === agent.id
                          ? 'text-white border-transparent'
                          : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-800'
                          }`}
                        style={{
                          backgroundColor: selectedAgent === agent.id ? primaryColor : undefined
                        }}
                      >
                        <div className={`font-medium text-sm ${selectedAgent === agent.id ? 'text-white' : 'text-gray-800'}`}>
                          {agent.name}
                        </div>
                        <div className={`text-xs mt-1 ${selectedAgent === agent.id ? 'text-white opacity-90' : 'text-gray-600'}`}>
                          {agent.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div key={message.id || index}>
                    {message.role === 'user' ? (
                      <div className="flex justify-end group">
                        <div className="flex items-start gap-2 max-w-[80%]">
                          {editingMessageId === message.id ? (
                            <div className="flex-1 bg-white border-2 border-blue-500 rounded-lg p-3 shadow-lg relative animate-fade-in" style={{ minWidth: 220, maxWidth: 400 }}>
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full resize-none border-none outline-none text-sm text-gray-800 bg-white placeholder-gray-400 transition-all duration-150 focus:ring-2 focus:ring-blue-400 rounded-lg pr-10"
                                rows={1}
                                style={{ minHeight: 36, maxHeight: 120, overflow: 'auto' }}
                                autoFocus
                                placeholder="Edit your message..."
                                onInput={e => {
                                  const target = e.target as HTMLTextAreaElement;
                                  target.style.height = '36px';
                                  target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                                }}
                              />
                              <div className="absolute top-2 right-2 flex gap-2">
                                <button
                                  onClick={() => handleSaveEdit(message.id)}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded-full transition-colors"
                                  title="Save"
                                  tabIndex={0}
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                  title="Cancel"
                                  tabIndex={0}
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div
                                className="p-3 rounded-lg text-black text-sm bg-white border border-gray-200 shadow"
                                style={{ maxWidth: '100%' }}
                              >
                                {typeof message.content === 'string' ? message.content :
                                  message.parts?.map(part => part.type === 'text' ? part.text : '').join('')
                                }
                              </div>
                              <button
                                onClick={() => handleEditMessage(
                                  message.id,
                                  typeof message.content === 'string' ? message.content :
                                    message.parts?.map(part => part.type === 'text' ? part.text : '').join('') || ''
                                )}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-all"
                                title="Edit message"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-start">
                        <div className="max-w-[95%] w-full bg-white rounded-lg p-3 shadow-sm border">
                          <div className="flex items-start gap-2 mb-2">
                            {/* Single bot icon - show loading animation only for the current loading message */}
                            {(index === messages.length - 1 && (isLoading || isSubmitting)) ? (
                              <div className="w-5 h-5 mt-0.5 flex-shrink-0 flex items-center justify-center">
                                <div className="flex space-x-1">
                                  <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div>
                                  <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                  <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                </div>
                              </div>
                            ) : (
                              <Bot className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                            )}
                            <div className="text-gray-800 flex-1 w-full overflow-hidden min-w-0">
                              {message.parts?.map((part, partIndex) => {
                                console.log('🔍 [CHATBOT] Processing message part:', {
                                  partIndex,
                                  type: part.type,
                                  text: part.type === 'text' ? part.text?.substring(0, 100) + '...' : 'N/A'
                                });

                                // Check if this text part contains a tool response JSON
                                if (part.type === 'text' && part.text.trim().startsWith('{') && part.text.includes('"artifacts"')) {
                                  try {
                                    console.log('🔍 [CHATBOT] Attempting to parse JSON tool response');
                                    const toolResult = JSON.parse(part.text.trim());
                                    console.log('🔍 [CHATBOT] Parsed tool result:', toolResult);

                                    if (toolResult.artifacts && toolResult.artifacts[0] && toolResult.artifacts[0].parts) {
                                      // Extract transaction data
                                      const artifactData = toolResult.artifacts[0].parts[0]?.data;
                                      const txPreview = artifactData?.txPreview;
                                      const txPlan = artifactData?.txPlan;

                                      console.log('🔍 [CHATBOT] Transaction data extracted:', { txPreview, txPlan });

                                      // If we have transaction data, render the preview
                                      if (txPreview || txPlan) {
                                        return (
                                          <div key={partIndex} className="w-full">
                                            <div className="w-full max-w-full overflow-hidden">
                                              {/* Show user-friendly message */}
                                              <div className="text-gray-800 text-sm leading-relaxed mb-3 chatbot-markdown">
                                                <Markdown>{toolResult.status?.message?.parts?.[0]?.text || 'Transaction plan ready'}</Markdown>
                                              </div>

                                              {/* Transaction Preview using the new component */}
                                              <TransactionPreview
                                                txPreview={txPreview}
                                                txPlan={txPlan}
                                                isLoading={false}
                                                className="w-full"
                                              />
                                            </div>
                                          </div>
                                        );
                                      }
                                    }
                                  } catch (error) {
                                    console.error('❌ [CHATBOT] Error parsing tool response:', error);
                                    console.log('📝 [CHATBOT] Raw text that failed to parse:', part.text);
                                    // Fall through to regular text rendering
                                  }
                                }

                                // Regular text or other content
                                return (
                                  <div key={partIndex} className="w-full overflow-hidden">
                                    {part.type === 'text' ? (
                                      <div className="text-gray-800 text-sm leading-relaxed break-words chatbot-markdown">
                                        <Markdown>{part.text}</Markdown>
                                      </div>
                                    ) : (
                                      <div className="w-full overflow-hidden">
                                        {/* Only show MessageRenderer when not loading to prevent duplicate bot icons */}
                                        {!(isLoading || isSubmitting) && partIndex === 0 && (
                                          <MessageRenderer
                                            key={partIndex}
                                            message={message}
                                            part={part}
                                            isLoading={false}
                                            mode="view"
                                            setMode={() => { }}
                                            isReadonly={false}
                                            setMessages={setMessages}
                                            reload={reload}
                                          />
                                        )}
                                        {/* Show loading text when this is the current loading message */}
                                        {(isLoading || isSubmitting) && index === messages.length - 1 && (
                                          <div className="text-gray-600 text-sm">
                                            Processing your request...
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {/* Show loading state when submitting immediately after user sends message */}
                {isSubmitting && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                  <div className="flex justify-start">
                    <div className="bg-white p-3 rounded-lg shadow-sm border">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 mt-0.5 flex-shrink-0 flex items-center justify-center">
                          <div className="flex space-x-1">
                            <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div>
                            <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                        <div className="text-gray-600 text-sm">Processing your request...</div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Only show loading state when there are no messages at all */}
                {(isLoading || isSubmitting) && messages.length === 0 && (
                  <div className="flex justify-start">
                    <div className="bg-white p-3 rounded-lg shadow-sm border">
                      <div className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-blue-500" />
                        <div className="text-gray-600 text-sm">{isSubmitting ? 'Processing your request...' : 'Thinking...'}</div>
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div>
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 p-4">
            <form onSubmit={handleFormSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                placeholder="Ask me anything about DeFi..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                disabled={isLoading || isSubmitting}
              />
              <button
                type="submit"
                disabled={isLoading || isSubmitting || !input.trim()}
                className="px-4 py-2 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
      {showClearConfirm && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black bg-opacity-30 rounded-[inherit] transition-opacity duration-200 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-7 w-full max-w-xs text-center animate-scale-in border border-gray-200">
            <Trash className="w-10 h-10 mx-auto text-red-500 mb-3" />
            <h4 className="font-semibold text-xl mb-2">Clear this conversation?</h4>
            <p className="text-gray-600 mb-5">This will remove all messages and reset the chat. Are you sure?</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setMessages([]);
                  setShowClearConfirm(false);
                }}
                className="px-5 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                Yes, clear
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-5 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
