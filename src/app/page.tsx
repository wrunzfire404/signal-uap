"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const TOKEN_CA = "3jG3vjwbEuQCR3YkJKtLmH41jqHx9n36BBW1Kznkpump";
const PUMP_FUN = `https://pump.fun/coin/${TOKEN_CA}`;
const TWITTER = "https://x.com/SignalUAP";

interface Signal {
  wallet: string;
  amount: number;
  timestamp: number;
  signature: string;
}

function shortAddr(s: string) {
  return s.length > 12 ? s.slice(0, 4) + "..." + s.slice(-4) : s;
}

function fmtAge(ts: number) {
  const d = Math.max(0, (Date.now() - ts) / 1000);
  if (d < 60) return Math.floor(d) + "s";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  return Math.floor(d / 86400) + "d";
}

function hashWallet(pk: string): number {
  let h = 2166136261;
  for (let i = 0; i < pk.length; i++) {
    h ^= pk.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [status, setStatus] = useState("SCANNING");

  // Fetch real data
  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      if (!res.ok) return;
      const data = await res.json();
      if (data.signals && data.signals.length > 0) {
        setSignals(data.signals);
        setTotalContacts(data.total);
        setStatus("ACTIVE");
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 30000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // Radar canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let animFrame: number;
    let sweepAngle = 0;

    const resize = () => {
      const size = Math.min(canvas.parentElement!.clientWidth, canvas.parentElement!.clientHeight, 500);
      canvas.style.width = size + "px";
      canvas.style.height = size + "px";
      canvas.width = size * DPR;
      canvas.height = size * DPR;
    };
    resize();
    window.addEventListener("resize", resize);

    const paint = () => {
      const w = canvas.width / DPR;
      const h = canvas.height / DPR;
      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(cx, cy) - 10;

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      // Fade trail
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, w, h);

      // Grid rings
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * (i / 4), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 65, ${0.08 + i * 0.02})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Cross lines
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
      ctx.strokeStyle = "rgba(0, 255, 65, 0.06)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Diagonal lines
      ctx.beginPath();
      const d = maxR * 0.707;
      ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
      ctx.strokeStyle = "rgba(0, 255, 65, 0.04)";
      ctx.stroke();

      // Sweep line
      sweepAngle += 0.015;
      const sweepX = cx + Math.cos(sweepAngle) * maxR;
      const sweepY = cy + Math.sin(sweepAngle) * maxR;

      // Sweep gradient trail (unused var removed)

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sweepX, sweepY);
      ctx.strokeStyle = "rgba(0, 255, 65, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Sweep glow arc (trailing)
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, sweepAngle - 0.5, sweepAngle);
      ctx.strokeStyle = "rgba(0, 255, 65, 0.15)";
      ctx.lineWidth = maxR;
      ctx.stroke();

      // Actually draw a proper sweep wedge
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweepAngle - 0.4, sweepAngle);
      ctx.closePath();
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      sweepGrad.addColorStop(0, "rgba(0, 255, 65, 0.12)");
      sweepGrad.addColorStop(1, "rgba(0, 255, 65, 0.02)");
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Contact dots (from real signals)
      const currentSignals = signals.length > 0 ? signals : [];
      for (const sig of currentSignals) {
        const hash = hashWallet(sig.wallet);
        const angle = ((hash & 0xffff) / 0xffff) * Math.PI * 2;
        const rNorm = ((hash >>> 16) & 0xffff) / 0xffff;
        const r = 20 + Math.sqrt(rNorm) * (maxR - 30);

        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;

        // Only glow if sweep recently passed
        const angleDiff = ((sweepAngle - angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const brightness = angleDiff < 1.5 ? (1 - angleDiff / 1.5) : 0.2;

        // Dot
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 65, ${0.3 + brightness * 0.7})`;
        ctx.fill();

        // Glow
        if (brightness > 0.3) {
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 255, 65, ${brightness * 0.15})`;
          ctx.fill();
        }
      }

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#00ff41";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 255, 65, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      animFrame = requestAnimationFrame(paint);
    };

    animFrame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", resize);
    };
  }, [signals]);

  return (
    <div className="min-h-screen radar-grid relative">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-[var(--border)] bg-black/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-[var(--green)] shadow-[0_0_6px_var(--green)]" />
            <span className="text-xs font-bold tracking-[0.3em] text-glow" style={{ fontFamily: "'Orbitron', monospace" }}>
              SIGNAL
            </span>
            <span className="text-[10px] text-[var(--ink-muted)] tracking-wider">UAP SIGNAL DETECTION</span>
          </div>
          <div className="flex items-center gap-3">
            <a href={TWITTER} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--ink-dim)] border border-[var(--border)] px-2 py-1 hover:text-[var(--green)] hover:border-[var(--green-dark)] transition-colors">
              TWITTER
            </a>
            <a href={PUMP_FUN} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--ink-dim)] border border-[var(--border)] px-2 py-1 hover:text-[var(--green)] hover:border-[var(--green-dark)] transition-colors">
              {shortAddr(TOKEN_CA)}
            </a>
          </div>
        </div>
      </header>

      <main className="pt-12 min-h-screen flex flex-col">
        {/* Stats bar */}
        <div className="border-b border-[var(--border)] bg-black/50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-6 text-[11px]">
            <div>
              <span className="text-[var(--ink-muted)] tracking-wider">CONTACTS</span>
              <span className="ml-2 text-[var(--green)] text-glow font-bold" style={{ fontFamily: "'Orbitron', monospace" }}>
                {totalContacts}
              </span>
            </div>
            <div className="w-px h-4 bg-[var(--border)]" />
            <div>
              <span className="text-[var(--ink-muted)] tracking-wider">STATUS</span>
              <span className="ml-2 text-[var(--green)]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--green)] mr-1 shadow-[0_0_4px_var(--green)]" />
                {status}
              </span>
            </div>
            <div className="w-px h-4 bg-[var(--border)]" />
            <div>
              <span className="text-[var(--ink-muted)] tracking-wider">NETWORK</span>
              <span className="ml-2 text-[var(--ink-dim)]">SOLANA MAINNET</span>
            </div>
            <div className="w-px h-4 bg-[var(--border)]" />
            <div>
              <span className="text-[var(--ink-muted)] tracking-wider">COORD</span>
              <span className="ml-2 text-[var(--ink-dim)]">38°52&apos;15&quot;N 77°03&apos;18&quot;W</span>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-5">
          {/* Left: Signal Log */}
          <div className="border border-[var(--border)] bg-[var(--surface)] flex flex-col lg:h-[600px]">
            <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--ink-dim)]">▮ SIGNAL LOG</span>
              <span className="text-[9px] text-[var(--ink-muted)]">{signals.length} entries</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0">
              {signals.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[11px] text-[var(--ink-muted)] italic">Scanning for signals...</span>
                </div>
              ) : (
                signals.map((sig, i) => (
                  <a
                    key={`${sig.wallet}-${i}`}
                    href={`https://solscan.io/account/${sig.wallet}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-2 py-1.5 border-b border-[var(--border)] hover:bg-[var(--green-dark)]/20 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[var(--green)]">{shortAddr(sig.wallet)}</span>
                      <span className="text-[9px] text-[var(--ink-muted)]">{fmtAge(sig.timestamp)}</span>
                    </div>
                    {sig.amount > 0 && (
                      <span className="text-[9px] text-[var(--ink-muted)]">STR {(sig.amount / 1000).toFixed(1)}K</span>
                    )}
                  </a>
                ))
              )}
            </div>
          </div>

          {/* Center: Radar */}
          <div className="border border-[var(--border)] bg-[var(--surface)] flex flex-col">
            <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--ink-dim)]">▮ DETECTION SCOPE</span>
              <span className="text-[9px] text-[var(--ink-muted)]">{totalContacts} contacts</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 min-h-[400px] lg:min-h-0">
              <canvas ref={canvasRef} />
            </div>
          </div>

          {/* Right: Intel */}
          <div className="border border-[var(--border)] bg-[var(--surface)] flex flex-col lg:h-[600px]">
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--ink-dim)]">▮ INTEL BRIEF</span>
            </div>
            <div className="flex-1 p-3 text-[11px] leading-relaxed text-[var(--ink-dim)] space-y-3 overflow-y-auto">
              <p>Unidentified signals detected propagating across the Solana network.</p>
              <p>Origin: <span className="text-[var(--green)]">UNKNOWN</span></p>
              <p>Pattern: <span className="text-[var(--green)]">ACCELERATING</span></p>
              <p className="border-t border-[var(--border)] pt-3">
                Every transaction amplifies the signal. Every holder extends detection range. We cannot explain what we are tracking — but we cannot ignore it.
              </p>
              <p className="border-t border-[var(--border)] pt-3 text-[var(--ink-muted)]">
                CLASSIFICATION: <span className="text-[var(--amber)]">UNRESOLVED</span>
              </p>
              <p className="text-[var(--ink-muted)]">
                REF: PURSUE / DOW-UAP-2026
              </p>
              <p className="text-[var(--ink-muted)]">
                PROTOCOL: $SIGNAL
              </p>

              <div className="border-t border-[var(--border)] pt-3 mt-auto">
                <p className="text-[9px] text-[var(--ink-muted)] tracking-wider uppercase">
                  They broadcast. We detect.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[var(--border)] bg-black/50">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between text-[9px] text-[var(--ink-muted)]">
            <span>$SIGNAL · UAP SIGNAL DETECTION · SOLANA</span>
            <span className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-[var(--green)] shadow-[0_0_3px_var(--green)]" />
              SYSTEM OPERATIONAL
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
