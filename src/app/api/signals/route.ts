import { NextResponse } from "next/server";

const TOKEN_CA = "HrzddZf32V7TuNrmcnUGECyEqewnU9cY6Yx9HfpteUAP";
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
      .filter((tx) => {
        // Only SWAP = actual buys/sells on the token
        if (tx.type !== "SWAP") return false;
        // Must have token transfer matching our CA
        if (!tx.tokenTransfers) return false;
        return tx.tokenTransfers.some((t) => t.mint === TOKEN_CA);
      })
      .map((tx) => {
        let amount = 0;
        let wallet = tx.feePayer;

        if (tx.tokenTransfers) {
          const tokenTx = tx.tokenTransfers.find((t) => t.mint === TOKEN_CA && t.tokenAmount > 0);
          if (tokenTx) {
            amount = tokenTx.tokenAmount;
            // toUserAccount = the buyer (receiver of token)
            if (tokenTx.toUserAccount && tokenTx.toUserAccount !== TOKEN_CA) {
              wallet = tokenTx.toUserAccount;
            }
          }
        }

        return {
          wallet,
          amount: Math.round(amount),
          timestamp: tx.timestamp * 1000,
          signature: tx.signature,
        };
      })
      .filter((s) => s.wallet && s.wallet !== TOKEN_CA && s.amount > 0);

    // Deduplicate by wallet (keep most recent)
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
