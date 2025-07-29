'use client';

import { useEffect, useState } from 'react';
// @ts-ignore - snarkjs doesn't have proper type exports
import { groth16 } from 'snarkjs';
import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MapPin, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { LOCATION_VERIFIER_CONFIG } from '@/lib/contracts/location-verifier';

interface LocationVerifierProps {
  onVerificationSuccess: () => void;
}

const LOCATION_VERIFIED_KEY = 'location_verified';

export function LocationVerifier({ onVerificationSuccess }: LocationVerifierProps) {
  const [location, setLocation] = useState('');
  const [stateLocation, setStateLocation] = useState('');
  const [minLat, setMinLat] = useState('');
  const [maxLat, setMaxLat] = useState('');
  const [minLon, setMinLon] = useState('');
  const [maxLon, setMaxLon] = useState('');
  const [verificationResult, setVerificationResult] = useState<boolean | null>(null);
  const [proof, setProof] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocationDisabled, setIsLocationDisabled] = useState<boolean>(false);
  const [areBoundingBoxInputsDisabled, setAreBoundingBoxInputsDisabled] = useState<boolean>(false);

  // Check if user has already verified location
  useEffect(() => {
    const isAlreadyVerified = sessionStorage.getItem(LOCATION_VERIFIED_KEY) === 'true';
    if (isAlreadyVerified) {
      onVerificationSuccess();
    }
  }, [onVerificationSuccess]);

  // Create viem client for Arbitrum Sepolia (similar to age verification)
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(LOCATION_VERIFIER_CONFIG.network.rpcUrl)
  });

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          const { latitude, longitude } = position.coords;
          setLocation(`Latitude: ${latitude}, Longitude: ${longitude}`);
          setIsLocationDisabled(true);
        },
        error => {
          setError('Unable to retrieve your location. Please allow GPS access.');
          console.error('Geolocation error:', error);
        }
      );
    } else {
      setError('Geolocation is not supported by this browser.');
    }
  };

  const fetchBoundingBox = async (state: string) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?state=${state}&format=json&polygon=1&addressdetails=1`
      );
      const data = await response.json();

      console.log('state data', data);

      if (data.length > 0) {
        setError(null);
        const { boundingbox } = data[0];
        setMinLat(boundingbox[0]);
        setMaxLat(boundingbox[1]);
        setMinLon(boundingbox[2]);
        setMaxLon(boundingbox[3]);
        setAreBoundingBoxInputsDisabled(true);
      } else {
        setError('State not found. Please enter a valid state name.');
      }
    } catch (err) {
      setError('Error fetching bounding box data.');
      console.error('Fetch error:', err);
    }
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const state = e.target.value;
    setStateLocation(state);
    if (state) {
      fetchBoundingBox(state);
    } else {
      setMinLat('');
      setMaxLat('');
      setMinLon('');
      setMaxLon('');
      setAreBoundingBoxInputsDisabled(false);
    }
  };

  const verifyLocation = async () => {
    try {
      console.log('Inside verify location');
      setLoading(true);
      setError(null);

      // Check contract address configuration
      if (LOCATION_VERIFIER_CONFIG.contractAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error('Contract address not configured. Please deploy the contract first.');
      }

      // Extract latitude and longitude from the location string
      const [latStr, lonStr] = location.split(', ').map(coord => coord.split(': ')[1]);
      const userLat = Math.round(parseFloat(latStr) * 1e7); // Scale to integer
      const userLon = Math.round(parseFloat(lonStr) * 1e7); // Scale to integer

      // Scale bounding box coordinates to integers
      const minLatScaled = Math.round(parseFloat(minLat) * 1e7);
      const maxLatScaled = Math.round(parseFloat(maxLat) * 1e7);
      const minLonScaled = Math.round(parseFloat(minLon) * 1e7);
      const maxLonScaled = Math.round(parseFloat(maxLon) * 1e7);

      console.log('Scaled coordinates:', {
        userLat,
        userLon,
        minLatScaled,
        maxLatScaled,
        minLonScaled,
        maxLonScaled
      });

      // Verify files are accessible before proceeding
      console.log('Checking WASM and zkey file accessibility...');
      try {
        const wasmResponse = await fetch('/LocationVerifier.wasm');
        const zkeyResponse = await fetch('/LocationVerifier_final.zkey');

        console.log('wasmResponse', wasmResponse);
        console.log('zkeyResponse', zkeyResponse);

        console.log('WASM response:', wasmResponse.status, wasmResponse.statusText);
        console.log('zkey response:', zkeyResponse.status, zkeyResponse.statusText);

        if (!wasmResponse.ok) {
          throw new Error(`WASM file not found: ${wasmResponse.status} ${wasmResponse.statusText}`);
        }
        if (!zkeyResponse.ok) {
          throw new Error(`zkey file not found: ${zkeyResponse.status} ${zkeyResponse.statusText}`);
        }

        // Check file sizes
        const wasmSize = wasmResponse.headers.get('content-length');
        const zkeySize = zkeyResponse.headers.get('content-length');
        console.log('WASM file size:', wasmSize, 'bytes');
        console.log('zkey file size:', zkeySize, 'bytes');

      } catch (fetchError: any) {
        console.error('File fetch error:', fetchError);
        throw new Error(`Failed to load verification files: ${fetchError.message}. Make sure LocationVerifier.wasm and LocationVerifier_final.zkey are in the public folder and accessible.`);
      }

      // Generate the proof with all six inputs
      console.log('Starting proof generation...');
      let proof, publicSignals;
      try {
        const { proof: p, publicSignals: ps } = await groth16.fullProve(
          {
            user_lat: userLat, // Private
            user_lon: userLon, // Private
            min_lat: minLatScaled, // Public
            max_lat: maxLatScaled, // Public
            min_lon: minLonScaled, // Public
            max_lon: maxLonScaled, // Public
          },
          '/LocationVerifier.wasm',
          '/LocationVerifier_final.zkey'
        );
        proof = p;
        publicSignals = ps;
      } catch (wasmError: any) {
        console.log('Primary WASM loading failed, trying alternative method:', wasmError);

        // Alternative: try loading as absolute URLs
        const baseUrl = window.location.origin;
        const wasmUrl = `${baseUrl}/LocationVerifier.wasm`;
        const zkeyUrl = `${baseUrl}/LocationVerifier_final.zkey`;

        console.log('Trying with absolute URLs:', { wasmUrl, zkeyUrl });

        const { proof: p, publicSignals: ps } = await groth16.fullProve(
          {
            user_lat: userLat,
            user_lon: userLon,
            min_lat: minLatScaled,
            max_lat: maxLatScaled,
            min_lon: minLonScaled,
            max_lon: maxLonScaled,
          },
          wasmUrl,
          zkeyUrl
        );
        proof = p;
        publicSignals = ps;
      }

      console.log('Proof generated successfully:', proof);
      console.log('Public signals:', publicSignals);

      // Verify that we have exactly 4 public signals
      if (!publicSignals || publicSignals.length !== 4) {
        throw new Error(`Expected 4 public signals, got ${publicSignals?.length || 0}`);
      }

      // Export calldata for the contract
      const calldata = await groth16.exportSolidityCallData(proof, publicSignals);
      console.log('Calldata generated:', calldata);
      const args = JSON.parse(`[${calldata}]`);

      console.log('args[0]', args[0]);
      console.log('args[1]', args[1]);
      console.log('args[2]', args[2]);
      console.log('args[3]', args[3]);

      // Call the contract's verifyProof function using viem
      const result = await publicClient.readContract({
        address: LOCATION_VERIFIER_CONFIG.contractAddress as `0x${string}`,
        abi: parseAbi(LOCATION_VERIFIER_CONFIG.abi.map(item => 
          `function ${item.name}(${item.inputs.map(input => `${input.type} ${input.name}`).join(', ')}) view returns (${item.outputs.map(output => output.type).join(', ')})`
        )),
        functionName: 'verifyProof',
        args: args
      });

      console.log('result', result);

      setVerificationResult(result as boolean);
      setProof(proof);

      if (result) {
        // Store verification status in sessionStorage
        sessionStorage.setItem(LOCATION_VERIFIED_KEY, 'true');
        toast.success('Location verified successfully!');
        onVerificationSuccess();
      } else {
        toast.error('Location verification failed!');
      }

      console.log('Contract verification result:', result);
    } catch (err: any) {
      console.error('Verification error:', err);

      if (err.message.includes('Assert Failed')) {
        setError("Your current location is not within the selected state's boundaries.");
      } else if (err.message.includes('Failed to load verification files')) {
        setError(err.message);
      } else if (err.message.includes('WebAssembly')) {
        setError('WebAssembly compilation failed. Please refresh the page and try again.');
      } else if (err.message.includes('NetworkError') || err.message.includes('fetch')) {
        setError('Network error while loading verification files. Please check your connection and try again.');
      } else if (err.message.includes('magic word') || err.message.includes('expected')) {
        setError('Invalid WebAssembly file format. The verification files may be corrupted.');
      } else if (err.message.includes('404') || err.message.includes('Not Found')) {
        setError('Verification files not found. Please ensure LocationVerifier.wasm and LocationVerifier_final.zkey are in the public folder.');
      } else {
        setError(`Verification failed: ${err.message}`);
      }

      toast.error('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTestWasm = async () => {
    try {
      console.log('Testing WASM file accessibility...');
      console.log('Current URL:', window.location.href);
      console.log('Origin:', window.location.origin);

      // Test fetching the WASM file
      const wasmUrl = '/LocationVerifier.wasm';
      console.log('Fetching WASM from:', wasmUrl);
      const wasmResponse = await fetch(wasmUrl);
      console.log('WASM response status:', wasmResponse.status, wasmResponse.statusText);
      console.log('WASM response headers:', Object.fromEntries(wasmResponse.headers.entries()));

      if (!wasmResponse.ok) {
        throw new Error(`WASM file fetch failed: ${wasmResponse.status} ${wasmResponse.statusText}`);
      }

      const wasmArrayBuffer = await wasmResponse.arrayBuffer();
      console.log('WASM file size:', wasmArrayBuffer.byteLength, 'bytes');

      // Test zkey file
      const zkeyUrl = '/LocationVerifier_final.zkey';
      console.log('Fetching zkey from:', zkeyUrl);
      const zkeyResponse = await fetch(zkeyUrl);
      console.log('zkey response status:', zkeyResponse.status, zkeyResponse.statusText);
      console.log('zkey response headers:', Object.fromEntries(zkeyResponse.headers.entries()));

      if (!zkeyResponse.ok) {
        throw new Error(`zkey file fetch failed: ${zkeyResponse.status} ${zkeyResponse.statusText}`);
      }

      const zkeyArrayBuffer = await zkeyResponse.arrayBuffer();
      console.log('zkey file size:', zkeyArrayBuffer.byteLength, 'bytes');

      // Verify file integrity by checking magic bytes
      const wasmBytes = new Uint8Array(wasmArrayBuffer);
      const wasmMagic = Array.from(wasmBytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
      console.log('WASM magic bytes:', wasmMagic, '(should be 0061736d for valid WASM)');

      toast.success(`WASM files loaded successfully! WASM: ${wasmArrayBuffer.byteLength} bytes, zkey: ${zkeyArrayBuffer.byteLength} bytes`);
    } catch (error) {
      console.error('WASM test failed:', error);
      toast.error('WASM test failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const isInputValid = () =>
    location !== '' && stateLocation !== '' && minLat !== '' && maxLat !== '' && minLon !== '' && maxLon !== '';

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-background/70 z-50 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-2">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Location Verification Required</CardTitle>
          <CardDescription>
            Please verify your location to access chat functionality with Maxxit Agents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location">
              Your Location <span className="text-red-500">*</span>
            </Label>
            <Input
              id="location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Fetching your location..."
              disabled={isLocationDisabled}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">
              State Location <span className="text-red-500">*</span>
            </Label>
            <Input
              id="state"
              type="text"
              value={stateLocation}
              onChange={handleStateChange}
              placeholder="Enter the state you want to verify"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minLat">
                Min Latitude <span className="text-red-500">*</span>
              </Label>
              <Input
                id="minLat"
                type="text"
                value={minLat}
                onChange={e => setMinLat(e.target.value)}
                placeholder="Min latitude"
                disabled={areBoundingBoxInputsDisabled}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxLat">
                Max Latitude <span className="text-red-500">*</span>
              </Label>
              <Input
                id="maxLat"
                type="text"
                value={maxLat}
                onChange={e => setMaxLat(e.target.value)}
                placeholder="Max latitude"
                disabled={areBoundingBoxInputsDisabled}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minLon">
                Min Longitude <span className="text-red-500">*</span>
              </Label>
              <Input
                id="minLon"
                type="text"
                value={minLon}
                onChange={e => setMinLon(e.target.value)}
                placeholder="Min longitude"
                disabled={areBoundingBoxInputsDisabled}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxLon">
                Max Longitude <span className="text-red-500">*</span>
              </Label>
              <Input
                id="maxLon"
                type="text"
                value={maxLon}
                onChange={e => setMaxLon(e.target.value)}
                placeholder="Max longitude"
                disabled={areBoundingBoxInputsDisabled}
                required
              />
            </div>
          </div>

          <Button
            onClick={handleTestWasm}
            variant="outline"
            className="w-full mb-2"
            size="sm"
          >
            Test WASM Files
          </Button>

          <Button
            onClick={verifyLocation}
            disabled={!isInputValid() || loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                Verify Location
              </>
            )}
          </Button>


          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {verificationResult !== null && !error && (
            <Alert variant={verificationResult ? 'default' : 'destructive'}>
              <AlertDescription>
                {verificationResult
                  ? 'Verified: Location is valid!'
                  : 'Verification failed: Invalid location or proof!'}
              </AlertDescription>
            </Alert>
          )}

          {proof && (
            <div className="mt-4">
              <Label className="text-sm font-medium">Proof Generated:</Label>
              <div className="bg-muted p-2 rounded-md overflow-x-auto text-xs mt-2">
                <pre>{JSON.stringify(proof, null, 2)}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 