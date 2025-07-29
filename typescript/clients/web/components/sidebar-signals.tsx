'use client';

import { useEffect, useState, useCallback } from 'react';
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, TrendingUp, TrendingDown, DollarSign, Target, Clock, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SignalData {
  token: string;
  signal: 'Buy' | 'Sell';
  currentPrice: number;
  targets: number[];
  stopLoss: number;
  timeline: string;
  maxExitTime: string;
  tradeTip: string;
  tweet_id: string;
  tweet_link: string;
  tweet_timestamp: string;
  priceAtTweet: number;
  exitValue: number | null;
  twitterHandle: string;
  tokenMentioned: string;
  tokenId: string;
}

interface Signal {
  _id: string;
  tweet_id: string;
  twitterHandle: string;
  coin: string;
  signal_message: string;
  signal_data: SignalData;
  generatedAt: string;
  subscribers: Array<{
    username: string;
    sent: boolean;
  }>;
  tweet_link: string;
  messageSent: boolean;
}

interface SidebarSignalsProps {
  onRefreshReady?: (refreshFn: () => void) => void;
}

export function SidebarSignals({ onRefreshReady }: SidebarSignalsProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshSignals = useCallback(() => {
    console.log('Refreshing signals...');
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
  }, []);

  // Expose the refresh function to parent component
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(refreshSignals);
    }
  }, [onRefreshReady, refreshSignals]);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        if (!isRefreshing) {
          setIsLoading(true);
        }
        setError(null);

        console.log('Fetching signals...');
        const response = await fetch(`/api/signals?t=${Date.now()}`, {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Signals response:', data);

        if (data.success) {
          setSignals(data.data || []);
          console.log('Signals set:', data.data);
          if (isRefreshing) {
            console.log('Signals refreshed successfully at:', data.timestamp);
          }
        } else {
          setError(data.message || 'Failed to fetch signals');
        }
      } catch (err) {
        console.error('Error fetching signals:', err);
        setError('Failed to fetch signals');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    };

    fetchSignals();
  }, [refreshKey, isRefreshing]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const getSignalIcon = (signal: string) => {
    return signal === 'Buy' ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-500" />
    );
  };

  const getSignalColor = (signal: string) => {
    return signal === 'Buy' ? 'text-green-600' : 'text-red-600';
  };

  const getSignalBgColor = (signal: string) => {
    return signal === 'Buy' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
  };

  const calculatePriceChange = (currentPrice: number, priceAtTweet: number) => {
    if (!priceAtTweet || priceAtTweet === 0) return null;
    const change = ((currentPrice - priceAtTweet) / priceAtTweet) * 100;
    return change;
  };

  if (isLoading) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
          Latest Trading Signals
        </div>
        <SidebarGroupContent>
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="rounded-md h-auto py-3 flex gap-2 px-2 items-start"
              >
                <Activity className="h-4 w-4 mt-0.5 flex-shrink-0 text-sidebar-foreground/30" />
                <div className="flex flex-col gap-1 flex-1">
                  <Skeleton
                    className="h-4 max-w-[--skeleton-width]"
                    style={
                      {
                        '--skeleton-width': `${Math.floor(Math.random() * 40) + 60}%`,
                      } as React.CSSProperties
                    }
                  />
                  <Skeleton
                    className="h-3 max-w-[--skeleton-width-2]"
                    style={
                      {
                        '--skeleton-width-2': `${Math.floor(Math.random() * 30) + 40}%`,
                      } as React.CSSProperties
                    }
                  />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (error) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-2 text-zinc-500 w-full flex flex-row justify-center items-center text-sm gap-2">
            <AlertTriangle className="h-4 w-4" />
            Failed to load signals
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (signals.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-2 text-zinc-500 w-full flex flex-row justify-center items-center text-sm gap-2">
            No signals available
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <div className="px-2 py-1 text-xs text-sidebar-foreground/50 flex items-center justify-between">
        <span>Latest Trading Signals</span>
        {isRefreshing && (
          <div className="flex items-center gap-1 text-xs text-sidebar-foreground/60">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Refreshing...</span>
          </div>
        )}
      </div>
      <SidebarGroupContent>
        <SidebarMenu>
          {signals.map((signal) => (
            <SidebarMenuItem key={signal._id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className="flex items-start gap-2 h-auto py-3 px-2 hover:bg-sidebar-accent cursor-pointer group"
                    onClick={() => {
                      if (signal.tweet_link) {
                        window.open(signal.tweet_link, '_blank');
                      }
                    }}
                  >
                    <div className="flex flex-col items-start text-left min-w-0 flex-1 gap-2">
                      {/* Header with token and signal */}
                      <div className="flex items-center gap-2 w-full">
                        {getSignalIcon(signal.signal_data.signal)}
                        <span className="text-sm font-semibold truncate">
                          {signal.signal_data.tokenMentioned}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getSignalBgColor(signal.signal_data.signal)} ${getSignalColor(signal.signal_data.signal)}`}>
                          {signal.signal_data.signal}
                        </span>
                      </div>

                      {/* Price information */}
                      <div className="flex items-center gap-1 text-xs text-sidebar-foreground/70">
                        <DollarSign className="h-3 w-3" />
                        <span>Entry: {formatPrice(signal.signal_data.currentPrice)}</span>
                        {(() => {
                          const priceChange = calculatePriceChange(signal.signal_data.currentPrice, signal.signal_data.priceAtTweet);
                          if (priceChange !== null) {
                            const isPositive = priceChange >= 0;
                            return (
                              <span className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                                ({isPositive ? '+' : ''}{priceChange.toFixed(2)}%)
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      {/* Targets */}
                      <div className="flex items-center gap-1 text-xs text-sidebar-foreground/70">
                        <Target className="h-3 w-3" />
                        <span>Targets: {signal.signal_data.targets.map(t => formatPrice(t)).join(', ')}</span>
                      </div>

                      {/* Stop Loss */}
                      <div className="flex items-center gap-1 text-xs text-red-500">
                        <AlertTriangle className="h-3 w-3" />
                        <span>SL: {formatPrice(signal.signal_data.stopLoss)}</span>
                      </div>

                      {/* Timeline and source */}
                      <div className="flex items-center justify-between w-full text-xs text-sidebar-foreground/50">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{signal.signal_data.timeline}</span>
                        </div>
                        <span>@{signal.twitterHandle}</span>
                      </div>

                      {/* Time ago and external link indicator */}
                      <div className="flex items-center justify-between w-full">
                        <div className="text-xs text-sidebar-foreground/40">
                          {formatDistanceToNow(new Date(signal.generatedAt), { addSuffix: true })}
                        </div>
                        <ExternalLink className="h-3 w-3 text-sidebar-foreground/30 group-hover:text-sidebar-foreground/60" />
                      </div>
                    </div>
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="space-y-2">
                    <div className="font-medium">{signal.signal_data.tokenMentioned} Signal</div>
                    <div className="text-sm">{signal.signal_data.tradeTip}</div>
                    <div className="text-xs text-muted-foreground">
                      Click to view original tweet
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
} 