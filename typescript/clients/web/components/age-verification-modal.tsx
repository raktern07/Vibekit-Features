'use client';

import { useState } from 'react';
// @ts-ignore - snarkjs doesn't have proper type exports
import { groth16 } from 'snarkjs';
import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoaderIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AGE_VERIFIER_CONFIG } from '@/lib/contracts/age-verifier';

interface AgeVerificationModalProps {
  onVerificationComplete: (verified: boolean) => void;
}

export function AgeVerificationModal({ onVerificationComplete }: AgeVerificationModalProps) {
  const [birthdate, setBirthdate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationFailed, setVerificationFailed] = useState<boolean>(false);

  // Create viem client for Arbitrum Sepolia
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(AGE_VERIFIER_CONFIG.network.rpcUrl)
  });

  const handleVerify = async () => {
    try {
      setLoading(true);
      setError(null);

      // Parse the birthdate input
      const birthdateTimestamp = Math.floor(new Date(birthdate).getTime() / 1000);
      const currentDateTimestamp = Math.floor(Date.now() / 1000);

      // Calculate user's age in years
      const ageInYears = Math.floor(
        (currentDateTimestamp - birthdateTimestamp) / (365 * 24 * 60 * 60)
      );

      // Set the minimum age threshold (18)
      const minAge = 18;

      console.log('Age verification inputs:', {
        minAge,
        birthdateTimestamp,
        currentDateTimestamp,
        ageInYears,
      });

      // Load the circuit files
      const wasmPath = '/AgeVerifier.wasm';
      const zkeyPath = '/AgeVerifier_final.zkey';

      // Verify that the files are accessible
      try {
        const wasmResponse = await fetch(wasmPath);
        if (!wasmResponse.ok) {
          throw new Error(`Failed to fetch WASM file: ${wasmResponse.status}`);
        }
        
        const zkeyResponse = await fetch(zkeyPath);
        if (!zkeyResponse.ok) {
          throw new Error(`Failed to fetch zkey file: ${zkeyResponse.status}`);
        }
      } catch (fetchError) {
        console.error('File fetch error:', fetchError);
        throw new Error('Required verification files are not accessible');
      }

      const { proof, publicSignals } = await groth16.fullProve(
        {
          minAge,
          birthdate: birthdateTimestamp,
          currentDate: currentDateTimestamp,
        },
        wasmPath,
        zkeyPath
      );

      console.log('Public Signals:', publicSignals);
      console.log('Proof:', proof);

      // Check contract address configuration
      if (AGE_VERIFIER_CONFIG.contractAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error('Contract address not configured. Please deploy the contract first.');
      }

      // Export calldata for the contract
      const calldata = await groth16.exportSolidityCallData(proof, publicSignals);
      const args = JSON.parse(`[${calldata}]`);

      console.log('Calling contract verification...');
      
      // Call the contract's verifyProof function
      const contractResult = await publicClient.readContract({
        address: AGE_VERIFIER_CONFIG.contractAddress as `0x${string}`,
        abi: parseAbi(AGE_VERIFIER_CONFIG.abi.map(item => 
          `function ${item.name}(${item.inputs.map(input => `${input.type} ${input.name}`).join(', ')}) view returns (${item.outputs.map(output => output.type).join(', ')})`
        )),
        functionName: 'verifyProof',
        args: args
      });

      console.log('Contract verification result:', contractResult);

      // Combine contract verification with public signals check for double validation
      const isAbove18 = contractResult && publicSignals.includes('1');

      console.log('Final verification result:', {
        contractResult,
        publicSignalCheck: publicSignals.includes('1'),
        finalResult: isAbove18
      });

      if (isAbove18) {
        // Store verification status in localStorage for persistence
        localStorage.setItem('age_verified', 'true');
        localStorage.setItem('age_verification_timestamp', Date.now().toString());
        
        toast.success('Age verification successful! You are confirmed to be 18 or older.');
        onVerificationComplete(true);
      } else {
        // User is under 18 - show persistent failure message
        setVerificationFailed(true);
        setError('You must be 18 or older to access Maxxit Agents. The zero-knowledge proof has confirmed that you do not meet the minimum age requirement.');
        toast.error('Access denied: You must be 18 or older to use this service.');
        // Don't call onVerificationComplete(false) to keep the modal open
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred during verification';
      setError(errorMessage);
      console.error('Age verification error:', err);
      toast.error('Age verification failed. Please try again.');
      // Don't call onVerificationComplete(false) on technical errors - allow retry
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = birthdate.trim() !== '';

  const handleTryAgain = () => {
    setBirthdate('');
    setError(null);
    setVerificationFailed(false);
  };

  const handleExit = () => {
    // Clear any stored verification and redirect or close app
    clearAgeVerification();
    window.location.href = 'https://www.google.com'; // Redirect to a neutral page
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-background/80 z-50 flex flex-col items-center justify-center gap-4 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-lg max-w-md w-full p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {verificationFailed ? 'Access Denied' : 'Age Verification Required'}
          </h2>
          <p className="text-muted-foreground">
            {verificationFailed 
              ? 'You must be 18 or older to access this application. The age verification process has been completed using zero-knowledge proofs.'
              : 'Please verify that you are 18 or older to access Maxxit Agents using zero-knowledge proof technology.'
            }
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="birthdate">Birth Date</Label>
            <Input
              id="birthdate"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full"
              disabled={loading}
            />
          </div>

          {!verificationFailed ? (
            <Button
              onClick={handleVerify}
              disabled={loading || !isFormValid}
              className="w-full"
              size="lg"
            >
              {loading && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Verifying Age...' : 'Verify My Age'}
            </Button>
          ) : (
            <div className="space-y-3">
              <Button
                onClick={handleTryAgain}
                variant="outline"
                className="w-full"
                size="lg"
              >
                Try Again
              </Button>
              <Button
                onClick={handleExit}
                variant="destructive"
                className="w-full"
                size="lg"
              >
                Exit Application
              </Button>
            </div>
          )}

          {error && (
            <div className={`rounded-lg p-4 ${
              verificationFailed 
                ? 'bg-destructive/20 border-2 border-destructive/40' 
                : 'bg-destructive/15 border border-destructive/20'
            }`}>
              <p className={`text-destructive font-medium ${
                verificationFailed ? 'text-base' : 'text-sm'
              }`}>
                {error}
              </p>
              {verificationFailed && (
                <p className="text-destructive/80 text-sm mt-2">
                  This verification uses cryptographic proofs to ensure privacy while confirming age requirements.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Your birth date is processed locally using zero-knowledge proofs. 
            We never see or store your actual birth date.
          </p>
        </div>
      </div>
    </div>
  );
}

// Utility function to check if age verification is still valid
export function isAgeVerificationValid(): boolean {
  const isVerified = localStorage.getItem('age_verified') === 'true';
  const timestamp = localStorage.getItem('age_verification_timestamp');
  
  if (!isVerified || !timestamp) {
    return false;
  }

  // Check if verification is less than 24 hours old
  const verificationTime = parseInt(timestamp);
  const twentyFourHours = 24 * 60 * 60 * 1000;
  const isWithinTimeLimit = Date.now() - verificationTime < twentyFourHours;

  return isWithinTimeLimit;
}

// Utility function to clear age verification
export function clearAgeVerification(): void {
  localStorage.removeItem('age_verified');
  localStorage.removeItem('age_verification_timestamp');
} 