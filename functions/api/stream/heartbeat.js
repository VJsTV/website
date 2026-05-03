import { previewAllowed } from '../../_lib/cors.js';

const CHANNELS = new Set(['ch1-live', 'ch2-loop-gallery', 'ch3-vj-education']);
const MAX_AGE_S = 120;

function hmac(key, data) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(k => crypto.subtle.sign('HMAC', k, enc.encode(data)))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const isPreview = previewAllowed(env);
  const allowed = ['https://vjstv.com', 'https://www.vjstv.com'];
  if (!isPreview && !allowed.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  const sigHeader = request.headers.get('X-Heartbeat-Sig') || '';
  const body = await request.text();

  if (env.HEARTBEAT_SECRET) {
    const expected = await hmac(env.HEARTBEAT_SECRET, body);
    if (sigHeader !== expected) {
      return new Response('Invalid signature', { status: 401 });
    }
  }

  let beat;
  try { beat = JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }

  const { channel, last_tick, playlist_key } = beat;
  if (!CHANNELS.has(channel)) return new Response('Unknown channel', { status: 400 });
  if (typeof last_tick !== 'number') return new Response('last_tick required', { status: 400 });

  const staleSecs = Math.floor(Date.now() / 1000) - last_tick;
  if (staleSecs > MAX_AGE_S) return new Response('Timestamp too old', { status: 400 });

  if (!env.HEARTBEAT_KV) return new Response('KV not configured', { status: 503 });

  await env.HEARTBEAT_KV.put(
    `hb:${channel}`,
    JSON.stringify({ channel, last_tick, playlist_key, received: Math.floor(Date.now() / 1000) }),
    { expirationTtl: 900 }
  );

  return new Response('ok', { status: 200 });
}
