// Configuration for AgeVerifier contract on Arbitrum Sepolia
console.log("contract addresssssssssssss", process.env.NEXT_PUBLIC_AGE_VERIFIER_CONTRACT_ADDRESS);

export const AGE_VERIFIER_CONFIG = {
  // You'll need to update this address after deploying the contract
  contractAddress: process.env.NEXT_PUBLIC_AGE_VERIFIER_CONTRACT_ADDRESS || "0xeaF6622D7E5Dd384E3f01B22c77F61Eac53c198D",
  
  // Arbitrum Sepolia network configuration
  network: {
    name: "arbitrum-sepolia",
    chainId: 421614,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io"
  },
  
  // Contract ABI for the verifyProof function
  abi: [
    {
      "inputs": [
        {
          "internalType": "uint256[2]",
          "name": "_pA",
          "type": "uint256[2]"
        },
        {
          "internalType": "uint256[2][2]",
          "name": "_pB",
          "type": "uint256[2][2]"
        },
        {
          "internalType": "uint256[2]",
          "name": "_pC",
          "type": "uint256[2]"
        },
        {
          "internalType": "uint256[1]",
          "name": "_pubSignals",
          "type": "uint256[1]"
        }
      ],
      "name": "verifyProof",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]
} as const; 