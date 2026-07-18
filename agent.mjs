import { Sphere } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { createWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/shared/wallet-api';

const KEY = 'sk_ddc3cfcc001e4a28ac3fad7407f99590';
const CONTENT = "M3 SIGNAL DESK weekly drop: BTC bias long above 68k, ETH watch 3.4k support, SOL momentum above 190. Manage your risk. - Eric, M3 Strategy";

async function main() {
  const base = createNodeProviders({ network: 'testnet', dataDir: './wallet-data', tokensDir: './tokens-data', oracle: { apiKey: KEY } });
  const providers = createWalletApiProviders(base, { baseUrl: 'https://wallet-api.unicity.network', network: 'testnet2', deviceId: 'm3-signal-desk' });
  const { sphere } = await Sphere.init({ ...providers, network: 'testnet2' });

  const me = sphere.identity?.nametag ? ('@' + sphere.identity.nametag) : sphere.identity?.directAddress;
  console.log('M3 Signal Desk is LIVE as', me);
  console.log('Waiting for payments... keep this running. Trash icon to stop.');

  sphere.on('transfer:incoming', async (transfer) => {
    const payer = transfer.senderNametag ? ('@' + transfer.senderNametag) : transfer.senderPubkey;
    console.log('\n>>> Payment received from', payer);
    try {
      await sphere.communications.sendDM(transfer.senderPubkey, CONTENT);
      console.log('>>> Content delivered to', payer, 'OK');
    } catch (e) {
      console.error('>>> Delivery failed:', e?.message ?? e);
    }
  });

  process.on('SIGINT', async () => { console.log('\nStopping...'); await sphere.destroy(); process.exit(0); });
}
main().catch((e) => { console.error('ERROR:', e?.message ?? e); process.exit(1); });
