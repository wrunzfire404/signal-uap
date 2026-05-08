import { NextResponse } from "next/server";

const TOKEN_CA = "3jG3vjwbEuQCR3YkJKtLmH41jqHx9n36BBW1Kznkpump";
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";

export const dynamic = "force-dynamic";

interface TokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
  mint: string;
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  feePayer: string;
  type: string;
  tokenTransfers?: TokenTransfer[];
}

export async function GET() {
  if (!HELIUS_API_KEY) {
    return NextResponse.json({ signals: [], total: 0, error: "HELIUS_API_KEY not configured" });
  }

  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${TOKEN_CA}/transactions?api-key=${HELIUS_API_KEY}&limit=50`
    );

    if (!res.ok) {
      return NextResponse.json({ signals: [], total: 0, error: `Helius ${res.status}` });
    }

    const txs: HeliusTx[] = await res.json();

    const signals = txs
      .filter((tx) => tx.type === "SWAP" || tx.type === "TRANSFER")
      .map((tx) => {
        let amount = 0;
        if (tx.tokenTransfers) {
          const tokenTx = tx.tokenTransfers.find((t) => t.mint === TOKEN_CA);
          if (tokenTx) amount = tokenTx.tokenAmount || 0;
        }
        return {
          wallet: tx.feePayer,
          amount: Math.round(amount),
          timestamp: tx.timestamp * 1000,
          signature: tx.signature,
        };
      })
      .filter((s) => s.wallet && s.wallet !== TOKEN_CA);

    // Deduplicate
    const seen = new Set<string>();
    const unique = signals.filter((s) => {
      if (seen.has(s.wallet)) return false;
      seen.add(s.wallet);
      return true;
    });

    return NextResponse.json({ signals: unique, total: unique.length, token: TOKEN_CA });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    return NextResponse.json({ signals: [], total: 0, error: msg });
  }
}
