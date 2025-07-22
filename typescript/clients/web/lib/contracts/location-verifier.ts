// Configuration for LocationVerifier contract on Arbitrum
console.log("LocationVerifier contract address:", process.env.NEXT_PUBLIC_LOCATION_VERIFIER_CONTRACT_ADDRESS);

export const LOCATION_VERIFIER_CONFIG = {
  // Update this address after deploying the contract
  contractAddress: process.env.NEXT_PUBLIC_LOCATION_VERIFIER_CONTRACT_ADDRESS || "0xC756A8f2f8A16D851Ee8C11DD00486dDFB456375",

  // Arbitrum Sepolia network configuration
  network: {
    name: "arbitrum-sepolia",
    rpcUrl: process.env.NEXT_PUBLIC_LOCATION_VERIFIER_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io"
  },

  // Contract ABI for the verifyProof function (Groth16Verifier)
  abi: [
    {
      inputs: [
        { internalType: 'uint256[2]', name: '_pA', type: 'uint256[2]' },
        { internalType: 'uint256[2][2]', name: '_pB', type: 'uint256[2][2]' },
        { internalType: 'uint256[2]', name: '_pC', type: 'uint256[2]' },
        { internalType: 'uint256[4]', name: '_pubSignals', type: 'uint256[4]' },
      ],
      name: 'verifyProof',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
  ]
} as const; 