import { useEffect, useRef, useState } from 'react';
import { autoConnect } from '@unicitylabs/sphere-sdk/connect/browser';
import { SPHERE_NETWORKS, RPC_METHODS, INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import type { AutoConnectResult } from '@unicitylabs/sphere-sdk/connect/browser';

const AGENT_NAMETAG = '@m3signal';
const PAY_AMOUNT_BASE_UNITS = '100000000'; // 1 UCT (8 decimals)
const WALLET_URL = 'https://sphere.unicity.network';
const PRICE_API = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';

type Status = 'idle' | 'connecting' | 'connected' | 'paying' | 'paid' | 'error';
type Tab = 'pay' | 'history' | 'about';

interface Asset {
  coinId: string;
  symbol: string;
  totalAmount: string;
}

interface PeerInfo {
  nametag?: string;
  transportPubkey: string;
  chainPubkey: string;
  directAddress: string;
  timestamp: number;
}

interface DirectMessage {
  id: string;
  senderPubkey: string;
  senderNametag?: string;
  recipientPubkey: string;
  recipientNametag?: string;
  content: string;
  timestamp: number;
  isRead: boolean;
}

interface ConversationPage {
  messages: DirectMessage[];
  hasMore: boolean;
  oldestTimestamp: number | null;
}

interface Prices {
  btc: number | null;
  eth: number | null;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatUsd(n: number | null): string {
  return n === null ? '—' : '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [identityLabel, setIdentityLabel] = useState<string>('');
  const [tab, setTab] = useState<Tab>('pay');
  const [drops, setDrops] = useState<DirectMessage[] | null>(null);
  const [dropsLoading, setDropsLoading] = useState(false);
  const [dropsError, setDropsError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Prices>({ btc: null, eth: null });
  const connRef = useRef<AutoConnectResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPrices() {
      try {
        const res = await fetch(PRICE_API);
        const data = await res.json();
        if (!cancelled) {
          setPrices({ btc: data?.bitcoin?.usd ?? null, eth: data?.ethereum?.usd ?? null });
        }
      } catch {
        // Price feed hiccup — ticker just keeps showing the last known values.
      }
    }
    loadPrices();
    const id = setInterval(loadPrices, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    autoConnect({
      dapp: { name: 'M3 Signal Desk', url: location.origin },
      walletUrl: WALLET_URL,
      network: SPHERE_NETWORKS.testnet2,
      silent: true,
    })
      .then((result) => {
        connRef.current = result;
        const id = result.connection.identity;
        setIdentityLabel(id.nametag ? '@' + id.nametag : (id.directAddress ?? '').slice(0, 20) + '…');
        setStatus('connected');
      })
      .catch(() => {
        // Not approved yet — wait for the user to tap Connect.
      });
  }, []);

  async function handleConnect() {
    setStatus('connecting');
    setError(null);
    try {
      const result = await autoConnect({
        dapp: { name: 'M3 Signal Desk', url: location.origin },
        walletUrl: WALLET_URL,
        network: SPHERE_NETWORKS.testnet2,
        silent: false,
      });
      connRef.current = result;
      const id = result.connection.identity;
      setIdentityLabel(id.nametag ? '@' + id.nametag : (id.directAddress ?? '').slice(0, 20) + '…');
      setStatus('connected');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not connect to your Sphere wallet.');
    }
  }

  async function handlePay() {
    const conn = connRef.current;
    if (!conn) return;
    setStatus('paying');
    setError(null);
    try {
      const assets = await conn.client.query<Asset[]>(RPC_METHODS.GET_ASSETS);
      const uct = assets?.find((a) => a.symbol === 'UCT');
      if (!uct) {
        throw new Error('No UCT found in this wallet. Self-mint some testnet UCT first, then try again.');
      }
      await conn.client.intent(INTENT_ACTIONS.SEND, {
        to: AGENT_NAMETAG,
        amount: PAY_AMOUNT_BASE_UNITS,
        coinId: uct.coinId,
      });
      setStatus('paid');
      setDrops(null);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Payment failed.');
    }
  }

  async function loadHistory() {
    const conn = connRef.current;
    if (!conn) return;
    setDropsLoading(true);
    setDropsError(null);
    try {
      const peer = await conn.client.query<PeerInfo>(RPC_METHODS.RESOLVE, { identifier: AGENT_NAMETAG });
      const page = await conn.client.query<ConversationPage>(RPC_METHODS.GET_MESSAGES, {
        peerPubkey: peer.transportPubkey,
        limit: 20,
      });
      const fromAgent = page.messages
        .filter((m) => m.senderPubkey === peer.transportPubkey)
        .sort((a, b) => b.timestamp - a.timestamp);
      setDrops(fromAgent);
    } catch (err) {
      setDropsError(err instanceof Error ? err.message : 'Could not load history.');
    } finally {
      setDropsLoading(false);
    }
  }

  function openHistory() {
    setTab('history');
    if (drops === null && status !== 'idle' && status !== 'connecting') loadHistory();
  }

  const connectedish = status === 'connected' || status === 'paying' || status === 'paid';

  const tickerItems = [
    { label: 'BTC', value: formatUsd(prices.btc) },
    { label: 'ETH', value: formatUsd(prices.eth) },
    { label: 'UCT', value: 'Testnet2 · no market value' },
  ];

  return (
    <div className="min-h-screen bg-[#0c0a0b] text-[#f3ede7] flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#8b2635] animate-pulse" />
          <span className="font-semibold tracking-wide text-sm text-white/80">M3 SIGNAL DESK</span>
        </div>
        {connectedish ? (
          <span className="text-xs font-mono text-white/50 bg-white/5 px-2.5 py-1 rounded-full">
            {identityLabel}
          </span>
        ) : null}
      </header>

      <div className="overflow-hidden border-b border-white/8 bg-white/[0.02] py-2">
        <div className="ticker-track flex gap-10 whitespace-nowrap w-max">
          {[...tickerItems, ...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="text-xs font-mono text-white/45 flex items-center gap-1.5">
              <span className="text-[#c17a86]">{item.label}</span>
              <span>{item.value}</span>
            </span>
          ))}
        </div>
      </div>

      <nav className="flex justify-center gap-1 px-6 pt-5">
        <button
          onClick={() => setTab('pay')}
          className={`px-4 py-1.5 rounded-full text-sm transition-colors ${tab === 'pay' ? 'bg-[#8b2635] text-white' : 'text-white/50 hover:text-white/80'}`}
        >
          This Week
        </button>
        {connectedish ? (
          <button
            onClick={openHistory}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${tab === 'history' ? 'bg-[#8b2635] text-white' : 'text-white/50 hover:text-white/80'}`}
          >
            History
          </button>
        ) : null}
        <button
          onClick={() => setTab('about')}
          className={`px-4 py-1.5 rounded-full text-sm transition-colors ${tab === 'about' ? 'bg-[#8b2635] text-white' : 'text-white/50 hover:text-white/80'}`}
        >
          About
        </button>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center py-10">
        {tab === 'pay' ? (
          <>
            <p className="text-xs uppercase tracking-[0.2em] text-[#c17a86] mb-4">Unicity Sphere · Testnet2</p>
            <h1 className="font-serif text-4xl sm:text-5xl leading-tight mb-4 max-w-lg">
              This week's signals,<br />delivered the instant you pay.
            </h1>
            <p className="text-white/55 max-w-sm mb-10 text-[15px] leading-relaxed">
              Pay 1 UCT to <span className="text-white/80">{AGENT_NAMETAG}</span>. An autonomous agent confirms it on-chain
              and DMs your watchlist back — no one on the other end, just the network.
            </p>

            {status === 'idle' || status === 'connecting' ? (
              <button
                onClick={handleConnect}
                disabled={status === 'connecting'}
                className="px-8 py-3.5 rounded-full bg-[#8b2635] text-white font-medium tracking-wide hover:bg-[#9e2c3d] transition-colors disabled:opacity-60"
              >
                {status === 'connecting' ? 'Connecting…' : 'Connect Sphere Wallet'}
              </button>
            ) : null}

            {status === 'connected' ? (
              <button
                onClick={handlePay}
                className="px-8 py-3.5 rounded-full bg-[#8b2635] text-white font-medium tracking-wide hover:bg-[#9e2c3d] transition-colors"
              >
                Pay 1 UCT for this week's drop
              </button>
            ) : null}

            {status === 'paying' ? (
              <button disabled className="px-8 py-3.5 rounded-full bg-[#8b2635]/60 text-white font-medium tracking-wide">
                Approve in your wallet…
              </button>
            ) : null}

            {status === 'paid' ? (
              <div className="rounded-2xl border border-[#8b2635]/40 bg-[#8b2635]/10 px-6 py-5 max-w-sm">
                <p className="text-[#e3a4ac] font-medium mb-1">Payment confirmed</p>
                <p className="text-white/60 text-sm">Check your Sphere DMs — {AGENT_NAMETAG} just sent this week's watchlist.</p>
              </div>
            ) : null}

            {status === 'error' && error ? (
              <div className="mt-5 max-w-sm rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300 text-sm text-left">
                {error}
              </div>
            ) : null}
          </>
        ) : null}

        {tab === 'history' ? (
          <div className="w-full max-w-md text-left">
            <h2 className="font-serif text-2xl mb-1 text-center">Your drop history</h2>
            <p className="text-white/45 text-sm mb-6 text-center">Pulled live from your DM thread with {AGENT_NAMETAG}</p>

            {dropsLoading ? <p className="text-white/50 text-center text-sm">Loading…</p> : null}

            {dropsError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
                {dropsError}
              </div>
            ) : null}

            {!dropsLoading && !dropsError && drops && drops.length === 0 ? (
              <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-6 text-center text-white/45 text-sm">
                No drops yet — pay above to receive your first one.
              </div>
            ) : null}

            {drops && drops.length > 0 ? (
              <div className="space-y-3">
                {drops.map((m) => (
                  <div key={m.id} className="rounded-xl border border-white/8 bg-white/3 px-4 py-3.5">
                    <p className="text-[11px] text-[#c17a86] mb-1.5">{formatDate(m.timestamp)}</p>
                    <p className="text-white/80 text-sm leading-relaxed">{m.content}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'about' ? (
          <div className="w-full max-w-md text-left">
            <h2 className="font-serif text-2xl mb-3 text-center">M3 Strategy</h2>
            <p className="text-white/60 text-sm leading-relaxed mb-8 text-center">
              A trading education brand built around one goal: turning discipline into consistency.
              We run a structured trading program, ongoing mentorship, and a community of traders
              who hold each other accountable — now extending onto Unicity Sphere.
            </p>

            <p className="text-xs uppercase tracking-[0.15em] text-[#c17a86] mb-3">Our Services</p>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3.5">
                <p className="text-white/85 font-medium text-sm mb-1">Trading Program</p>
                <p className="text-white/50 text-sm leading-relaxed">A 4-week course covering strategy, risk, and execution from the ground up.</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3.5">
                <p className="text-white/85 font-medium text-sm mb-1">Mentorship</p>
                <p className="text-white/50 text-sm leading-relaxed">2 months of ongoing support after the course, so what you learn actually sticks.</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3.5">
                <p className="text-white/85 font-medium text-sm mb-1">Signal Desk</p>
                <p className="text-white/50 text-sm leading-relaxed">Weekly signals, delivered on-chain the instant you pay — autonomously, via Unicity Sphere.</p>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <footer className="px-6 py-4 text-center text-[11px] text-white/30">
        M3 Strategy · built on Unicity Sphere
      </footer>
    </div>
  );
}
