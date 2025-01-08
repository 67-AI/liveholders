import { Connection, PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';

// $LIVE token address
const LIVE_TOKEN_ADDRESS = '9eF4iX4BzeKnvJ7gSw5L725jk48zJw2m66NFxHHvpump';

// Helius RPC endpoint with your API key
const RPC_ENDPOINT = 'https://rpc.helius.xyz/?api-key=e2d4b800-7644-4bb7-838b-aae1a3000b56';

// Cache settings
const CACHE_DURATION = 10000; // 10 seconds cache
const RATE_LIMIT_DELAY = 2000; // 2 seconds delay for rate limits
let lastResult: { timestamp: number; holders: number } | null = null;
let fetchInProgress = false;

async function getTokenHolders(mintAddress: string): Promise<number> {
    // Return cached result if valid and available
    if (lastResult && Date.now() - lastResult.timestamp < CACHE_DURATION) {
        return lastResult.holders;
    }

    // If a fetch is already in progress, wait for cache
    if (fetchInProgress) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (lastResult) {
            return lastResult.holders;
        }
    }

    try {
        fetchInProgress = true;
        const connection = new Connection(RPC_ENDPOINT, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
        });

        const mint = new PublicKey(mintAddress);
        const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        
        const accounts = await connection.getProgramAccounts(tokenProgramId, {
            commitment: 'confirmed',
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: mint.toBase58()
                    }
                },
                {
                    dataSize: 165
                }
            ]
        });

        const uniqueHolders = new Set();
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                const amountData = data.slice(64, 72);
                const amount = BigInt('0x' + Buffer.from(amountData).toString('hex'));
                
                if (amount > BigInt(0)) {
                    const ownerData = data.slice(32, 64);
                    const owner = new PublicKey(ownerData).toString();
                    uniqueHolders.add(owner);
                }
            } catch (e) {
                console.error('Error parsing account data:', e);
            }
        }

        const holderCount = Math.floor(uniqueHolders.size);
        lastResult = {
            timestamp: Date.now(),
            holders: holderCount
        };

        return holderCount;
    } catch (error: any) {
        if (typeof error.message === 'string' && error.message.includes('429')) {
            console.error('Rate limit hit, using cached data if available...');
            if (lastResult) {
                return lastResult.holders;
            }
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
            return getTokenHolders(mintAddress);
        }
        throw error;
    } finally {
        fetchInProgress = false;
    }
}

export async function GET() {
    try {
        const holders = await getTokenHolders(LIVE_TOKEN_ADDRESS);
        return NextResponse.json({ holders });
    } catch (error) {
        console.error('API Error:', error);
        if (lastResult) {
            return NextResponse.json({ holders: lastResult.holders });
        }
        return NextResponse.json(
            { error: 'Failed to fetch holder count' },
            { status: 500 }
        );
    }
} 