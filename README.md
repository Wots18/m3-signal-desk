# M3 Signal Desk

**Autonomous, on-chain trading signals - pay in, get delivered, no human involved.**

Built on [Unicity Sphere](https://sphere.unicity.network) for Unicity Epoch Four: The Call for Builders.

Live app: https://m3-signal-desk.vercel.app
Agent identity: `@m3signal` on Sphere testnet2

---

## What it does

M3 Signal Desk is the on-chain arm of [M3 Strategy](https://x.com/Eric_Wots), a trading education brand. Anyone can:

1. **Connect** their Sphere wallet on the web app
2. **Pay 1 UCT** to `@m3signal`
3. An **autonomous agent** confirms the payment on-chain and DMs back that week's trading watchlist - instantly, with no person on the other end
4. **View drop history** - a live read of the buyer's own DM thread with `@m3signal`, proving every past delivery really happened on-chain

No database, no backend API, no manual fulfilment. The wallet, the payment, and the delivery are the entire product.

## Track

**Payments & Markets** - a storefront pattern (pay -> autonomous delivery) built entirely on Sphere's payment and messaging primitives.

## Architecture

```
Web frontend (Vercel, Vite)
  -- connect / query / intent(send) -->
User's wallet (Sphere, browser)
  -- real testnet2 payment -->
Unicity Sphere network
  -- transfer:incoming event -->
Agent (Railway, 24/7, @m3signal, Node.js)
  -- listens, then calls sendDM() -->
Back to the user, as a Sphere DM
```

The frontend and the agent never talk to each other directly - they only communicate through the Sphere network itself (a real payment, a real DM), which is the pattern Sphere is built for.

## Tech stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS v4, deployed on Vercel
- **Agent:** Node.js, deployed on Railway (wallet restored from a mnemonic env var on every cold start, so its identity - `@m3signal` - is stable across redeploys)
- **SDK:** `@unicitylabs/sphere-sdk` - Connect protocol (`autoConnect`, `ConnectClient`) on the frontend; direct `Sphere` instance with `payments` and `communications` modules on the agent

### SDK surfaces used

| Feature | Where |
|---|---|
| `autoConnect` (popup transport) | Frontend wallet connect |
| `sphere_getAssets` query | Frontend - resolve the real UCT coin ID before paying |
| `send` intent | Frontend - the actual payment |
| `sphere_resolve` + `sphere_getMessages` queries | Frontend - real DM history tab |
| `transfer:incoming` event | Agent - detects payment |
| `communications.sendDM` | Agent - delivers content |
| `payments.mintFungibleToken` | Used during development to self-mint testnet UCT |
| `registerNametag` | Used once to claim `@m3signal` |

## Running locally

```bash
# Agent
npm install
AGENT_MNEMONIC="your twelve word mnemonic" node agent.mjs

# Frontend
cd web
npm install
npm run dev
```

## Team

Built by Eric Asamoah ([@Eric_Wots](https://x.com/Eric_Wots)) for M3 Strategy - entirely from a phone, via GitHub Codespaces.
