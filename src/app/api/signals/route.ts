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
    return NextResponse.json({ signals: [], total: 0, error: "HELIUS_API_KEY not configured", debug: "env var missing" });
  }

  try {
    const url = `https://api.helius.xyz/v0/addresses/${TOKEN_CA}/transactions?api-key=${HELIUS_API_KEY}&limit=50`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ signals: [], total: 0, error: `Helius ${res.status}`, debug: errText.slice(0, 200) });
    }

    const txs: HeliusTx[] = await res.json();

    const signals = txs
      .filter((tx) => tx.type === "SWAP" && tx.tokenTransfers && tx.tokenTransfers.length > 0)
      .map((tx) => {
        // feePayer = the person who initiated the swap (buyer or seller)
        // This is always the real user wallet
        const wallet = tx.feePayer;
        let amount = 0;

        // Find token transfer for our mint
        if (tx.tokenTransfers) {
          for (const tt of tx.tokenTransfers) {
            if (tt.mint === TOKEN_CA && tt.tokenAmount > 0) {
              amount = tt.tokenAmount;
              break;
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
      .filter((s) => s.wallet && s.amount > 0);

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
