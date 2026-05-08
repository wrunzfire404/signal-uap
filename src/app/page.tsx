"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const TOKEN_CA = "HrzddZf32V7TuNrmcnUGECyEqewnU9cY6Yx9HfpteUAP";
const PUMP_FUN = `https://pump.fun/coin/${TOKEN_CA}`;
const TWITTER = "https://x.com/UAPSignalDetect";

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

// Generate simulated contacts for visual when no real data
function generateSimContacts(count: number): Array<{ angle: number; r: number; brightness: number }> {
  const contacts = [];
  for (let i = 0; i < count; i++) {
    contacts.push({
      angle: Math.random() * Math.PI * 2,
      r: 0.15 + Math.random() * 0.8,
      brightness: 0.3 + Math.random() * 0.7,
    });
  }
  return contacts;
}

interface ContactNode {
  x: number;
  y: number;
  wallet: string;
  angle: number;
  r: number;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [status, setStatus] = useState("SCANNING");
  const [simContacts] = useState(() => generateSimContacts(35));
  const [hoveredContact, setHoveredContact] = useState<{ wallet: string; x: number; y: number } | null>(null);
  const contactNodesRef = useRef<ContactNode[]>([]);

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
      } else {
        setTotalContacts(0);
        setStatus("SCANNING");
      }
    } catch {
      setTotalContacts(0);
      setStatus("SCANNING");
    }
  }, [simContacts.length]);

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
      const parent = canvas.parentElement!;
      const size = Math.min(parent.clientWidth - 20, parent.clientHeight - 20, 480);
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
      const maxR = Math.min(cx, cy) - 8;

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      // Fade
      ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
      ctx.fillRect(0, 0, w, h);

      // Grid rings
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * (i / 4), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 65, ${0.06 + i * 0.015})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Cross + diagonal
      ctx.strokeStyle = "rgba(0, 255, 65, 0.05)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
      ctx.stroke();
      const d = maxR * 0.707;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
      ctx.strokeStyle = "rgba(0, 255, 65, 0.03)";
      ctx.stroke();

      // Sweep
      sweepAngle += 0.012;

      // Sweep wedge
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweepAngle - 0.5, sweepAngle);
      ctx.closePath();
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      sweepGrad.addColorStop(0, "rgba(0, 255, 65, 0.15)");
      sweepGrad.addColorStop(0.7, "rgba(0, 255, 65, 0.04)");
      sweepGrad.addColorStop(1, "rgba(0, 255, 65, 0.01)");
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Sweep line
      const sweepX = cx + Math.cos(sweepAngle) * maxR;
      const sweepY = cy + Math.sin(sweepAngle) * maxR;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sweepX, sweepY);
      ctx.strokeStyle = "rgba(0, 255, 65, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Contacts - use real data if available, otherwise simulated
      const useReal = signals.length > 0;
      const contactList = useReal
        ? signals.map((sig) => {
            const hash = hashWallet(sig.wallet);
            return {
              angle: ((hash & 0xffff) / 0xffff) * Math.PI * 2,
              r: 0.15 + Math.sqrt(((hash >>> 16) & 0xffff) / 0xffff) * 0.8,
              brightness: 0.6,
              wallet: sig.wallet,
            };
          })
        : simContacts.map((c, i) => ({ ...c, wallet: `SIM_${i}` }));

      // Store node positions for hit detection
      const nodes: ContactNode[] = [];

      for (const contact of contactList) {
        const x = cx + Math.cos(contact.angle) * (contact.r * maxR);
        const y = cy + Math.sin(contact.angle) * (contact.r * maxR);

        nodes.push({ x, y, wallet: contact.wallet, angle: contact.angle, r: contact.r });

        // Brightness based on sweep proximity
        const angleDiff = ((sweepAngle - contact.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const sweepBright = angleDiff < 1.2 ? (1 - angleDiff / 1.2) : 0;
        const totalBright = Math.max(0.15, sweepBright * contact.brightness);

        // Dot (bigger for clickability)
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 65, ${totalBright})`;
        ctx.fill();

        // Glow on sweep pass
        if (sweepBright > 0.3) {
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 255, 65, ${sweepBright * 0.12})`;
          ctx.fill();
        }

        // Wallet label for real contacts (show short addr near dot)
        if (useReal && sweepBright > 0.5) {
          ctx.font = "9px 'JetBrains Mono', monospace";
          ctx.fillStyle = `rgba(0, 255, 65, ${sweepBright * 0.7})`;
          ctx.fillText(contact.wallet.slice(0, 4) + "..." + contact.wallet.slice(-3), x + 6, y + 3);
        }
      }

      contactNodesRef.current = nodes;

      // Center
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#00ff41";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 255, 65, 0.3)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Outer ring glow
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 255, 65, 0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      animFrame = requestAnimationFrame(paint);
    };

    animFrame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", resize);
    };
  }, [signals, simContacts]);

  return (
    <div className="min-h-screen radar-grid relative">
      {/* Background UAP image overlay */}
      <div
        className="fixed inset-0 z-0 opacity-[0.04] pointer-events-none"
        style={{ backgroundImage: "url(/images/hud-display.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
      />

      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-[var(--border)] bg-black/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/images/profile-twitter.jpg" alt="SIGNAL" className="w-7 h-7 rounded-full border border-[var(--green-dark)] shadow-[0_0_8px_rgba(0,255,65,0.2)]" />
            <span className="text-xs font-bold tracking-[0.3em] text-glow" style={{ fontFamily: "'Orbitron', monospace" }}>
              SIGNAL
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href={TWITTER} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--ink-dim)] border border-[var(--border)] px-2 py-1 hover:text-[var(--green)] hover:border-[var(--green-dark)] transition-colors tracking-wider">
              TWITTER
            </a>
            <a href={PUMP_FUN} target="_blank" rel="noopener noreferrer" className="hidden sm:block text-[10px] text-[var(--ink-dim)] border border-[var(--border)] px-2 py-1 hover:text-[var(--green)] hover:border-[var(--green-dark)] transition-colors font-mono whitespace-nowrap">
              {TOKEN_CA}
            </a>
          </div>
        </div>
      </header>

      <main className="pt-12 min-h-screen flex flex-col relative z-10">
        {/* Hero section with big counter */}
        <section className="border-b border-[var(--border)] py-10 sm:py-16 text-center relative overflow-hidden">
          {/* Subtle UAP image in background */}
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "url(/images/uap-infrared.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />

          <div className="relative z-10 max-w-4xl mx-auto px-4">
            <p className="text-[10px] tracking-[0.5em] text-[var(--ink-muted)] mb-4 uppercase">Presidential Unsealing and Reporting System · PURSUE</p>
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black text-glow-strong tabular-nums" style={{ fontFamily: "'Orbitron', monospace" }}>
              {totalContacts}
            </h1>
            <p className="text-sm sm:text-base tracking-[0.4em] text-[var(--ink-dim)] mt-3 uppercase" style={{ fontFamily: "'Orbitron', monospace" }}>
              Signals Detected
            </p>
            <p className="mt-6 text-[11px] text-[var(--ink-muted)] max-w-md mx-auto leading-relaxed">
              Unidentified signals propagating across the Solana network. Origin: unknown. Pattern: accelerating. Every transaction amplifies the signal.
            </p>

            {/* Status indicators */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] shadow-[0_0_4px_var(--green)]" />
                <span className="text-[var(--ink-dim)] tracking-wider">STATUS: {status}</span>
              </div>
              <span className="text-[var(--border)]">|</span>
              <span className="text-[var(--ink-muted)] tracking-wider">NETWORK: SOLANA</span>
              <span className="text-[var(--border)]">|</span>
              <span className="text-[var(--ink-muted)] tracking-wider">38°52&apos;15&quot;N 77°03&apos;18&quot;W</span>
            </div>
          </div>
        </section>

        {/* Main 3-column layout */}
        <section className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-4">
          {/* Left: Signal Log */}
          <div className="border border-[var(--border)] bg-black/80 flex flex-col lg:h-[560px]">
            <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface)]">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--ink-dim)]">▮ SIGNAL LOG</span>
              <span className="text-[9px] text-[var(--ink-muted)]">{signals.length > 0 ? signals.length : "—"} entries</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {signals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                  <div className="w-3 h-3 rounded-full border border-[var(--green-dark)] mb-3 relative">
                    <span className="absolute inset-0 rounded-full bg-[var(--green)] opacity-50 animate-ping" />
                  </div>
                  <p className="text-[10px] text-[var(--ink-muted)]">SCANNING FOR SIGNALS...</p>
                  <p className="text-[9px] text-[var(--ink-muted)] mt-1 opacity-50">Awaiting contact</p>
                </div>
              ) : (
                signals.map((sig, i) => (
                  <a
                    key={`${sig.wallet}-${i}`}
                    href={`https://solscan.io/account/${sig.wallet}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--green-dark)]/10 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] shadow-[0_0_3px_var(--green)]" />
                        <span className="text-[11px] text-[var(--green)] font-mono">{shortAddr(sig.wallet)}</span>
                      </div>
                      <span className="text-[9px] text-[var(--ink-muted)]">{fmtAge(sig.timestamp)}</span>
                    </div>
                    {sig.amount > 0 && (
                      <p className="text-[9px] text-[var(--ink-muted)] mt-0.5 ml-5">STRENGTH {(sig.amount / 1000).toFixed(1)}K</p>
                    )}
                  </a>
                ))
              )}
            </div>
          </div>

          {/* Center: Radar */}
          <div className="border border-[var(--border)] bg-black/80 flex flex-col">
            <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface)]">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--ink-dim)]">▮ DETECTION SCOPE</span>
              <span className="text-[9px] text-[var(--ink-muted)]">{totalContacts} contacts · live</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 min-h-[400px] lg:min-h-[500px] relative">
              <canvas
                ref={canvasRef}
                className="relative z-10 cursor-crosshair"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mx = e.clientX - rect.left;
                  const my = e.clientY - rect.top;
                  const nodes = contactNodesRef.current;
                  let found: ContactNode | null = null;
                  for (const node of nodes) {
                    if (node.wallet.startsWith("SIM_")) continue;
                    const dist = Math.hypot(node.x - mx, node.y - my);
                    if (dist < 12) { found = node; break; }
                  }
                  if (found) {
                    setHoveredContact({ wallet: found.wallet, x: e.clientX, y: e.clientY });
                    e.currentTarget.style.cursor = "pointer";
                  } else {
                    setHoveredContact(null);
                    e.currentTarget.style.cursor = "crosshair";
                  }
                }}
                onMouseLeave={() => setHoveredContact(null)}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mx = e.clientX - rect.left;
                  const my = e.clientY - rect.top;
                  const nodes = contactNodesRef.current;
                  for (const node of nodes) {
                    if (node.wallet.startsWith("SIM_")) continue;
                    const dist = Math.hypot(node.x - mx, node.y - my);
                    if (dist < 12) {
                      window.open(`https://solscan.io/account/${node.wallet}`, "_blank");
                      break;
                    }
                  }
                }}
              />
              {/* Hover tooltip */}
              {hoveredContact && (
                <div
                  className="fixed z-50 px-2.5 py-1.5 bg-black/95 border border-[var(--green-dark)] rounded text-[10px] font-mono pointer-events-none shadow-[0_0_10px_rgba(0,255,65,0.15)]"
                  style={{ left: hoveredContact.x + 12, top: hoveredContact.y - 30 }}
                >
                  <p className="text-[var(--green)]">{shortAddr(hoveredContact.wallet)}</p>
                  <p className="text-[var(--ink-muted)] text-[9px]">Click to view on Solscan</p>
                </div>
              )}
              {/* Corner decorations */}
              <span className="absolute top-3 left-3 text-[8px] text-[var(--ink-muted)] font-mono tracking-wider">RNG: 250NM</span>
              <span className="absolute top-3 right-3 text-[8px] text-[var(--ink-muted)] font-mono tracking-wider">MODE: SEARCH</span>
              <span className="absolute bottom-3 left-3 text-[8px] text-[var(--ink-muted)] font-mono tracking-wider">AZ: 000-360</span>
              <span className="absolute bottom-3 right-3 flex items-center gap-1 text-[8px] text-[var(--green)] font-mono">
                <span className="w-1 h-1 rounded-full bg-[var(--green)] shadow-[0_0_3px_var(--green)]" />
                LIVE
              </span>
            </div>
          </div>

          {/* Right: Intel Brief */}
          <div className="border border-[var(--border)] bg-black/80 flex flex-col lg:h-[560px]">
            <div className="px-3 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--ink-dim)]">▮ INTEL BRIEF</span>
            </div>
            <div className="flex-1 p-3 text-[11px] leading-[1.7] text-[var(--ink-dim)] space-y-3 overflow-y-auto">
              {/* UAP image */}
              <div className="relative rounded overflow-hidden border border-[var(--border)] mb-3">
                <img src="/images/uap-infrared.jpg" alt="UAP Infrared" className="w-full h-24 object-cover opacity-60" />
                <span className="absolute bottom-1 left-2 text-[8px] text-[var(--green)] font-mono tracking-wider">FLIR CAPTURE · 2025</span>
              </div>

              <p className="text-[var(--green)]">▸ CLASSIFICATION: UNRESOLVED</p>
              <p>Unidentified signals detected propagating across the Solana network.</p>
              <p>Origin: <span className="text-[var(--green)]">UNKNOWN</span></p>
              <p>Pattern: <span className="text-[var(--green)]">ACCELERATING</span></p>

              <div className="border-t border-[var(--border)] pt-3">
                <p className="text-[var(--ink-muted)]">Every transaction amplifies the signal. Every holder extends detection range.</p>
              </div>

              <div className="border-t border-[var(--border)] pt-3">
                <p className="text-[9px] text-[var(--ink-muted)] tracking-wider">REF: PURSUE / DOW-UAP-2026</p>
                <p className="text-[9px] text-[var(--ink-muted)] tracking-wider">PROTOCOL: $SIGNAL</p>
                <p className="text-[9px] text-[var(--ink-muted)] tracking-wider">CHAIN: SOLANA MAINNET</p>
              </div>

              {/* Second image */}
              <div className="relative rounded overflow-hidden border border-[var(--border)]">
                <img src="/images/hud-display.jpg" alt="HUD" className="w-full h-20 object-cover opacity-50" />
                <span className="absolute bottom-1 left-2 text-[8px] text-[var(--green)] font-mono tracking-wider">SIGNAL ARRAY · ACTIVE</span>
              </div>

              <div className="border-t border-[var(--border)] pt-3">
                <p className="text-[10px] text-[var(--ink-muted)] tracking-[0.2em] uppercase">
                  They broadcast. We detect.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom bar */}
        <div className="border-t border-[var(--border)] bg-black/95">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between text-[9px] text-[var(--ink-muted)] tracking-wider">
            <span>$SIGNAL · UAP SIGNAL DETECTION · SOLANA</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] shadow-[0_0_4px_var(--green)]" />
              SYSTEM OPERATIONAL
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
