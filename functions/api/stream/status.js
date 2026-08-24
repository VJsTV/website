const CHANNELS = ['ch1-live', 'ch2-loop-gallery', 'ch3-vj-education'];
const STALE_THRESHOLD = 300;

export async function handleGet(request, env) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=30',
  };

  if (!env.HEARTBEAT_KV) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: corsHeaders });
  }

  const now = Math.floor(Date.now() / 1000);
  const results = await Promise.all(
    CHANNELS.map(async ch => {
      const raw = await env.HEARTBEAT_KV.get(`hb:${ch}`);
      if (!raw) return { channel: ch, status: 'unknown', last_tick: null, playlist_key: null };
      const beat = JSON.parse(raw);
      const age = now - beat.last_tick;
      return {
        channel: ch,
        status: age <= STALE_THRESHOLD ? 'live' : 'stale',
        last_tick: beat.last_tick,
        playlist_key: beat.playlist_key,
        age_secs: age,
      };
    })
  );

  return new Response(JSON.stringify({ channels: results, ts: now }), { headers: corsHeaders });
}

export async function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' },
  });
}
