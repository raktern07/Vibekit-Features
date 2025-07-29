'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';

import { PlusIcon } from '@/components/icons';
import { SidebarHistory } from '@/components/sidebar-history';
import { SidebarSignals } from '@/components/sidebar-signals';
import { SidebarUserNav } from '@/components/sidebar-user-nav';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { useSession } from 'next-auth/react';
import { History, Signal, RefreshCw } from 'lucide-react';

export function AppSidebar() {
  const { data: session } = useSession();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const user = session?.user;
  const [showSignals, setShowSignals] = useState(false);
  const [refreshSignals, setRefreshSignals] = useState<(() => void) | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshSignals = useCallback(() => {
    if (refreshSignals) {
      setIsRefreshing(true);
      refreshSignals();
      // Reset refreshing state after a short delay
      setTimeout(() => setIsRefreshing(false), 2000);
    }
  }, [refreshSignals]);

  // Reset refresh function when switching away from signals
  useEffect(() => {
    if (!showSignals) {
      setRefreshSignals(null);
    }
  }, [showSignals]);

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center">
            <Link
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
              className="flex flex-row gap-3 items-center"
            >
              <span className="text-lg font-semibold px-2 hover:bg-muted rounded-md cursor-pointer text-cyan-700">
                {process.env.PROJECT_NAME || "Maxxit AI"}
              </span>
            </Link>
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    type="button"
                    className="p-2 h-fit"
                    onClick={() => setShowSignals(!showSignals)}
                  >
                    {showSignals ? <History className="h-4 w-4" /> : <Signal className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent align="end">
                  {showSignals ? 'Show Chat History' : 'Show Signals'}
                </TooltipContent>
              </Tooltip>
              {showSignals && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      type="button"
                      className="p-2 h-fit"
                      onClick={handleRefreshSignals}
                      disabled={isRefreshing}
                    >
                      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent align="end">
                    {isRefreshing ? 'Refreshing...' : 'Refresh Signals'}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    type="button"
                    className="p-2 h-fit"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push('/');
                      router.refresh();
                    }}
                  >
                    <PlusIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent align="end">New Chat</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {showSignals ? (
          <SidebarSignals
            key="signals"
            onRefreshReady={setRefreshSignals}
          />
        ) : (
          <SidebarHistory user={user} />
        )}
      </SidebarContent>
      <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
