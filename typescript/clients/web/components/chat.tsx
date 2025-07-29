'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { useSession } from 'next-auth/react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { AgeVerificationModal, isAgeVerificationValid } from './age-verification-modal';
import { LocationVerifier } from './location-verifier';
import { CryptoCarousel } from './crypto-tweets-carousel';

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
  selectedChatAgent: initialChatAgent,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  selectedChatAgent: string;
}) {
  const { mutate } = useSWRConfig();
  const { address } = useAccount();
  const { data: session } = useSession();

  const [selectedChatAgent, _setSelectedChatAgent] = useState(initialChatAgent);
  const [isAgeVerified, setIsAgeVerified] = useState<boolean>(false);
  const [showAgeVerification, setShowAgeVerification] = useState<boolean>(false);
  const [isLocationVerified, setIsLocationVerified] = useState<boolean>(false);
  const [showLocationVerification, setShowLocationVerification] = useState<boolean>(false);

  // Check age and location verification status on component mount and when session changes
  useEffect(() => {
    if (session?.user && address) {
      const isAgeValid = isAgeVerificationValid();
      const isLocationValid = sessionStorage.getItem('location_verified') === 'true';

      setIsAgeVerified(isAgeValid);
      setIsLocationVerified(isLocationValid);

      // Show age verification first if not done
      if (!isAgeValid) {
        setShowAgeVerification(true);
        setShowLocationVerification(false);
      }
      // Show location verification if age is done but location is not
      else if (isAgeValid && !isLocationValid) {
        setShowAgeVerification(false);
        setShowLocationVerification(true);
      }
      // Both are verified
      else {
        setShowAgeVerification(false);
        setShowLocationVerification(false);
      }
    }
  }, [session, address]);

  const handleAgeVerificationComplete = (verified: boolean) => {
    setIsAgeVerified(verified);
    setShowAgeVerification(false);
    if (verified) {
      // Check if location is already verified
      const isLocationValid = sessionStorage.getItem('location_verified') === 'true';
      if (isLocationValid) {
        setIsLocationVerified(true);
        toast.success('Welcome! You can now access Maxxit Agents.');
      } else {
        // Show location verification after age verification
        setShowLocationVerification(true);
        toast.success('Age verification complete! Now please verify your location.');
      }
    }
  };

  const handleLocationVerificationComplete = () => {
    setIsLocationVerified(true);
    setShowLocationVerification(false);
    toast.success('Location verification complete! Welcome to Maxxit Agents.');
  };

  const { messages, setMessages, handleSubmit, input, setInput, append, status, stop, reload } =
    useChat({
      id,
      body: {
        id,
        selectedChatModel,
        context: {
          walletAddress: address,
        },
      },
      initialMessages,
      experimental_throttle: 100,
      sendExtraMessageFields: true,
      generateId: generateUUID,
      onFinish: () => {
        mutate('/api/history');
      },
      onError: () => {
        toast.error('An error occured, please try again!');
      },
    });

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector(state => state.isVisible);

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        {/* Wallet Connection Layer */}
        {(!session || !session?.user) && (
          <div className="fixed inset-0 backdrop-blur-sm bg-background/70 z-50 flex flex-col items-center justify-center gap-4">
            <h2 className="text-xl font-semibold">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-4">
              Authentication required to chat with Maxxit Agents
            </p>
            <ConnectButton />
          </div>
        )}

        {/* Age Verification Layer */}
        {session?.user && address && showAgeVerification && (
          <AgeVerificationModal onVerificationComplete={handleAgeVerificationComplete} />
        )}

        {/* Location Verification Layer */}
        {session?.user && address && isAgeVerified && showLocationVerification && (
          <LocationVerifier onVerificationSuccess={handleLocationVerificationComplete} />
        )}
        <ChatHeader />

        {/* Crypto Tweets Carousel */}
        {/* {session?.user && address && isAgeVerified && isLocationVerified && ( */}
        <div className="px-4 py-1 bg-background/50 border-b">
          <CryptoCarousel />
        </div>
        {/* )} */}

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages as UIMessage[]}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && session?.user && address && isAgeVerified && isLocationVerified && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages as UIMessage[]}
              setMessages={setMessages}
              append={append}
              selectedAgentId={selectedChatAgent}
            />
          )}
        </form>
      </div>

      {session?.user && address && isAgeVerified && isLocationVerified && (
        <Artifact
          chatId={id}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          status={status}
          stop={stop}
          attachments={attachments}
          setAttachments={setAttachments}
          append={append}
          messages={messages as UIMessage[]}
          setMessages={setMessages}
          reload={reload}
          votes={votes}
          isReadonly={isReadonly}
          selectedAgentId={selectedChatAgent}
        />
      )}
    </>
  );
}
