'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useSidebar } from './ui/sidebar';

interface Tweet {
  id: string;
  influencer: {
    name: string;
    handle: string;
    avatar: string;
  };
  coin: string;
  tokenId: string;
  positive: boolean;
  pnl: number;
  timestamp: string;
}

interface CryptoTickerProps {
  className?: string;
}

export function CryptoCarousel({ className }: CryptoTickerProps) {
  const { state: sidebarState, isMobile } = useSidebar();
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTweets = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/top-crypto-tweets-data');
        if (!response.ok) {
          throw new Error('Failed to fetch tweets');
        }
        const data = await response.json();
        setTweets(data.tweets || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tweets');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTweets();
  }, []);

  const formatPnl = (pnl: number) => {
    if (!isFinite(pnl)) return '∞';
    return `${pnl > 0 ? '+' : ''}${pnl?.toFixed(2)}%`;
  };

  const renderTweetItem = (tweet: Tweet, index: number) => (
    <div key={`${tweet.id}-${index}`} className="flex items-center gap-2 py-2 px-1 whitespace-nowrap flex-shrink-0 min-w-0">
      {/* Influencer Avatar */}
      <Avatar className="h-6 w-6 border border-border/50 flex-shrink-0">
        <AvatarImage src={tweet.influencer.avatar} />
        <AvatarFallback className="text-xs">
          {tweet.influencer.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Influencer Name */}
      <span className="text-xs font-medium text-foreground truncate max-w-20">
        {tweet.influencer.name}
      </span>

      {/* Separator */}
      <div className="w-px h-3 bg-border flex-shrink-0"></div>

      {/* Coin Badge */}
      <Badge variant="outline" className="text-xs font-mono px-1.5 py-0.5 bg-muted/50 flex-shrink-0">
        {tweet.coin}
      </Badge>

      {/* Trend Icon */}
      {tweet.positive ? (
        <TrendingUp className="h-3 w-3 text-green-500 flex-shrink-0" />
      ) : (
        <TrendingDown className="h-3 w-3 text-red-500 flex-shrink-0" />
      )}

      {/* PnL */}
      <span className={cn(
        "text-xs font-bold font-mono flex-shrink-0",
        tweet.positive ? "text-green-500" : "text-red-500"
      )}>
        {formatPnl(tweet.pnl)}
      </span>

      {/* Time */}
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {formatDistanceToNow(new Date(tweet.timestamp), { addSuffix: true })}
      </span>

      {/* Separator for next item */}
      <div className="w-px h-4 bg-border/30 ml-4 flex-shrink-0"></div>
    </div>
  );

  if (isLoading) {
    return (
      <div className={cn("h-10 bg-muted/10 rounded-md animate-pulse flex items-center px-4", className)}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-muted rounded-full"></div>
          <div className="text-xs text-muted-foreground">Loading crypto signals...</div>
        </div>
      </div>
    );
  }

  if (error || tweets.length === 0) {
    return (
      <div className={cn("h-10 bg-muted/10 rounded-md flex items-center px-4", className)}>
        <div className="text-xs text-muted-foreground">
          {error || 'No crypto signals available'}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-gradient-to-r from-background via-muted/5 to-background border rounded-md z-[1]",
        className
      )}
      style={{
        maxWidth: isMobile ? '100vw' : (sidebarState === 'expanded' ? 'calc(100vw - 18rem)' : '100vw'),
        width: '100%',
        overflow: 'hidden'
      }}
    >
      {/* Live indicator */}
      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-[1] flex items-center gap-2 bg-background/90 px-2 py-1 rounded-sm">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-xs font-medium text-foreground">LIVE</span>
      </div>

      {/* Ticker Strip */}
      <div className="h-10 flex items-center overflow-hidden">
        <div className="w-16 flex-shrink-0"></div> {/* Space for live indicator */}

        <div className="flex-1 relative overflow-hidden">
          <div className="flex animate-scroll">
            {/* First set of tweets */}
            {tweets.map((tweet, index) => renderTweetItem(tweet, index))}
            {/* Duplicate for seamless loop */}
            {tweets.map((tweet, index) => renderTweetItem(tweet, index + tweets.length))}
          </div>
        </div>
      </div>

      {/* Fade edges for seamless effect */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none z-[1]"></div>
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background via-background/80 to-transparent pointer-events-none z-[1]"></div>

      {/* CSS Animation Styles */}
      <style jsx>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        
        .animate-scroll {
          animation: scroll 60s linear infinite;
          display: flex;
          width: max-content;
          max-width: none;
        }
        
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}